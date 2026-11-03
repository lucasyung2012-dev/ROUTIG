import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/en';
import { pt } from '@/i18n/pt';
import { interpolate, translate, translateList } from '@/i18n';

function shape(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  if (Array.isArray(node)) return [`${prefix}[${node.length}]`];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
}

describe('textos', () => {
  it('português e inglês têm exatamente as mesmas chaves e listas do mesmo tamanho', () => {
    expect(shape(en).sort()).toEqual(shape(pt).sort());
  });

  it('nenhum texto está vazio', () => {
    const empty = (node: unknown): boolean =>
      typeof node === 'string' ? node.trim() === '' : Array.isArray(node) ? node.some(empty) : Object.values(node as object).some(empty);
    expect(empty(pt)).toBe(false);
    expect(empty(en)).toBe(false);
  });

  it('as variáveis de cada texto são as mesmas nos dois idiomas', () => {
    const vars = (node: unknown, prefix = ''): Record<string, string> => {
      if (typeof node === 'string') return { [prefix]: (node.match(/\{\w+\}/g) ?? []).sort().join(',') };
      if (Array.isArray(node)) return {};
      return Object.assign({}, ...Object.entries(node as Record<string, unknown>).map(([k, v]) => vars(v, prefix ? `${prefix}.${k}` : k)));
    };
    expect(vars(en)).toEqual(vars(pt));
  });

  it('traduz, interpola e lê listas', () => {
    expect(translate('en', 'modules.languages')).toBe('Languages');
    expect(translate('pt-BR', 'modules.languages')).toBe('Idiomas');
    expect(translate('pt-BR', 'common.comingIn', { stage: 2 })).toBe('Chega na Etapa 2');
    expect(interpolate('{a} e {b}', { a: 1 })).toBe('1 e {b}');
    expect(translateList('pt-BR', 'moduleFeatures.academy').length).toBeGreaterThan(3);
  });
});

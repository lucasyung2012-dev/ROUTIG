import { en } from './en';
import { pt, type Messages } from './pt';
import type { Locale } from '@/domain/settings';

export const dictionaries: Record<Locale, Messages> = { 'pt-BR': pt, en };

type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`;

/** Todas as chaves que terminam em texto (ex.: "nav.main"). */
export type MessageKey<T = Messages, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? Join<P, K> : T[K] extends readonly string[] ? never : MessageKey<T[K], Join<P, K>>;
}[keyof T & string];

/** Chaves que terminam em lista de textos (ex.: "moduleFeatures.tasks"). */
export type ListKey<T = Messages, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? never : T[K] extends readonly string[] ? Join<P, K> : ListKey<T[K], Join<P, K>>;
}[keyof T & string];

function lookup(dict: Messages, key: string): unknown {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return node;
}

export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Com count = 1, usa a forma "chave_one" quando ela existe ("1 cartão" em vez de "1 cartões"). */
export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const one = vars?.count === 1 ? (lookup(dictionaries[locale], `${key}_one`) ?? lookup(pt, `${key}_one`)) : undefined;
  const value = one ?? lookup(dictionaries[locale], key) ?? lookup(pt, key);
  return typeof value === 'string' ? interpolate(value, vars) : key;
}

export function translateList(locale: Locale, key: ListKey): string[] {
  const value = lookup(dictionaries[locale], key) ?? lookup(pt, key);
  return Array.isArray(value) ? (value as string[]) : [];
}

export type { Messages };

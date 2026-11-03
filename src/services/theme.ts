import type { Settings, ThemeSetting } from '@/domain/settings';

export type ResolvedTheme = 'light' | 'dark';

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(theme: ThemeSetting, prefersDark = systemPrefersDark()): ResolvedTheme {
  if (theme === 'auto') return prefersDark ? 'dark' : 'light';
  return theme;
}

/**
 * Aplica tema, tamanho de texto e movimento no elemento raiz.
 * No modo automático não há data-theme: o CSS segue prefers-color-scheme.
 */
export function applyAppearance(s: Pick<Settings, 'theme' | 'fontSize' | 'reduceMotion'>, root = document.documentElement): void {
  if (s.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);

  if (s.fontSize === 'normal') root.removeAttribute('data-font');
  else root.setAttribute('data-font', s.fontSize);

  if (s.reduceMotion) root.setAttribute('data-motion', 'reduce');
  else root.removeAttribute('data-motion');

  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', resolveTheme(s.theme) === 'dark' ? '#080B1C' : '#F7F6FC');

  // Espelho síncrono só para evitar o "pisca" do tema na próxima abertura.
  try {
    localStorage.setItem('routig.theme', s.theme);
  } catch {
    /* armazenamento do navegador indisponível: o tema ainda funciona nesta sessão */
  }
}

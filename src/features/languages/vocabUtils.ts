import { speechLang, type VocabEntry } from '@/domain/languages';

/** Lê o texto em voz alta com a voz do aparelho (funciona sem internet quando a voz está instalada). */
export function speak(text: string, code: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speechLang(code);
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Como a palavra aparece: "der Hund", "你好 · nǐ hǎo". */
export function displayTerm(v: Pick<VocabEntry, 'term' | 'german' | 'mandarin'>): string {
  if (v.german?.article) return `${v.german.article} ${v.term}`;
  if (v.mandarin?.characters && v.mandarin.characters !== v.term) return `${v.mandarin.characters} · ${v.term}`;
  return v.term;
}

/** O que a voz do aparelho deve ler para a palavra. */
export function speakTextOf(v: Pick<VocabEntry, 'term' | 'german' | 'mandarin'>): string {
  return v.mandarin?.characters || (v.german?.article ? `${v.german.article} ${v.term}` : v.term);
}

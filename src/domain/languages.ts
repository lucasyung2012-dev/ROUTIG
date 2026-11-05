import { z } from 'zod';
import type { BaseEntity } from './entity';
import type { DateKey } from './dates';
import type { SrsState } from './srs';

/* ---------- Idiomas (Parte 10.1) ---------- */

/** Recursos específicos: alemão (gênero, casos, regência) e mandarim (caracteres, pinyin, tons). */
export const LANGUAGE_PROFILES = ['generic', 'german', 'mandarin'] as const;
export type LanguageProfile = (typeof LANGUAGE_PROFILES)[number];

/**
 * Níveis de referência (Quadro Europeu, QECR). São autoavaliação: o app nunca
 * trata isso como certificado oficial (Parte 10.5).
 */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const SKILLS = ['reading', 'writing', 'listening', 'speaking'] as const;
export type Skill = (typeof SKILLS)[number];

export interface SkillState {
  /** Nível de referência que você acha que tem (ou null). */
  level: CefrLevel | null;
  /** Como você se sente nessa habilidade, de 1 (muito inseguro) a 5 (muito seguro). */
  confidence: number | null;
  notes: string;
}

export interface Language extends BaseEntity {
  name: string;
  /** Código curto (en, de, es, zh…), usado para escolher o perfil e a pronúncia do aparelho. */
  code: string;
  profile: LanguageProfile;
  color: string;
  /** Idioma nativo: aparece, mas sem autoavaliação de nível. */
  native: boolean;
  /** Nível geral de referência (autoavaliação). */
  level: CefrLevel | null;
  goals: string[];
  skills: Record<Skill, SkillState>;
  notes: string;
  order: number;
}

export interface LanguagePreset {
  name: string;
  code: string;
  color: string;
  native?: boolean;
}

/** Os cinco idiomas iniciais do usuário (Parte 10.1); ele pode adicionar qualquer outro. */
export const LANGUAGE_PRESETS: LanguagePreset[] = [
  { name: 'Português', code: 'pt', color: '#30A46C', native: true },
  { name: 'Inglês', code: 'en', color: '#438BEA' },
  { name: 'Alemão', code: 'de', color: '#F59E0B' },
  { name: 'Espanhol', code: 'es', color: '#E5484D' },
  { name: 'Mandarim', code: 'zh', color: '#8E4EC6' },
];

export function profileForCode(code: string): LanguageProfile {
  const c = code.trim().toLowerCase();
  if (c === 'de' || c.startsWith('de-')) return 'german';
  if (c === 'zh' || c.startsWith('zh-') || c === 'cmn') return 'mandarin';
  return 'generic';
}

export function emptySkills(): Record<Skill, SkillState> {
  return { reading: { level: null, confidence: null, notes: '' }, writing: { level: null, confidence: null, notes: '' }, listening: { level: null, confidence: null, notes: '' }, speaking: { level: null, confidence: null, notes: '' } };
}

const skillSchema = z.object({ level: z.enum(CEFR_LEVELS).nullable(), confidence: z.number().int().min(1).max(5).nullable(), notes: z.string().max(4000) });

export const languageInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().max(12),
  profile: z.enum(LANGUAGE_PROFILES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  native: z.boolean(),
  level: z.enum(CEFR_LEVELS).nullable(),
  goals: z.array(z.string().trim().min(1).max(200)).max(30),
  skills: z.object({ reading: skillSchema, writing: skillSchema, listening: skillSchema, speaking: skillSchema }),
  notes: z.string().max(8000),
});

export type LanguageInput = z.infer<typeof languageInputSchema>;

export function languageInputOf(l: Language): LanguageInput {
  const { name, code, profile, color, native, level, goals, skills, notes } = l;
  return { name, code, profile, color, native, level, goals, skills, notes };
}

/* ---------- Sessões de estudo (Parte 10.6) ---------- */

export const LANGUAGE_ACTIVITIES = ['vocabulary', 'grammar', 'reading', 'writing', 'listening', 'speaking', 'pronunciation', 'conversation', 'review', 'class', 'other'] as const;
export type LanguageActivity = (typeof LANGUAGE_ACTIVITIES)[number];

/** Que habilidade cada atividade treina (para somar o tempo por habilidade). */
export const ACTIVITY_SKILL: Partial<Record<LanguageActivity, Skill>> = {
  reading: 'reading',
  writing: 'writing',
  listening: 'listening',
  speaking: 'speaking',
  pronunciation: 'speaking',
  conversation: 'speaking',
};

export interface LanguageSession extends BaseEntity {
  languageId: string;
  date: DateKey;
  activity: LanguageActivity;
  durationMin: number;
  /** O que foi estudado (texto livre). */
  content: string;
  difficulties: string;
  /** Resultado (ex.: "entendi 80% do episódio", "acertei 18 de 20"). */
  result: string;
  notes: string;
  noteIds: string[];
}

export type LanguageSessionInput = Pick<LanguageSession, 'languageId' | 'date' | 'activity' | 'durationMin' | 'content' | 'difficulties' | 'result' | 'notes' | 'noteIds'>;

export const languageSessionInputSchema = z.object({
  languageId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activity: z.enum(LANGUAGE_ACTIVITIES),
  durationMin: z.number().int().min(1).max(600),
  content: z.string().max(2000),
  difficulties: z.string().max(4000),
  result: z.string().max(2000),
  notes: z.string().max(8000),
  noteIds: z.array(z.string()).max(50),
});

/** Minutos por habilidade e por atividade, num conjunto de sessões. */
export function sessionStats(list: Pick<LanguageSession, 'activity' | 'durationMin' | 'date'>[]) {
  const bySkill: Record<Skill, number> = { reading: 0, writing: 0, listening: 0, speaking: 0 };
  const byActivity: Partial<Record<LanguageActivity, number>> = {};
  let total = 0;
  for (const s of list) {
    total += s.durationMin;
    byActivity[s.activity] = (byActivity[s.activity] ?? 0) + s.durationMin;
    const sk = ACTIVITY_SKILL[s.activity];
    if (sk) bySkill[sk] += s.durationMin;
  }
  return { total, sessions: list.length, days: new Set(list.map((s) => s.date)).size, bySkill, byActivity };
}

/* ---------- Vocabulário (Parte 10.3) ---------- */

export const PARTS_OF_SPEECH = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'article', 'numeral', 'interjection', 'expression', 'other'] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

export const GERMAN_ARTICLES = ['der', 'die', 'das'] as const;
export type GermanArticle = (typeof GERMAN_ARTICLES)[number];

export interface GermanInfo {
  article: GermanArticle | null;
  /** Caso(s) que a palavra pede ou em que aparece (Nominativ, Akkusativ, Dativ, Genitiv). */
  cases: string;
  /** Preposição que acompanha (ex.: warten auf). */
  prepositions: string;
  /** Regência: o que o verbo/adjetivo pede (ex.: "jemandem helfen" = Dativ). */
  government: string;
}

export interface MandarinInfo {
  characters: string;
  /** Pinyin com marcas de tom (nǐ hǎo). Pode ser digitado com números (ni3 hao3). */
  pinyin: string;
  /** Tons por sílaba, ex.: "3 3". */
  tones: string;
}

export interface VocabEntry extends BaseEntity {
  languageId: string;
  term: string;
  translation: string;
  /** Significado no contexto (quando a tradução sozinha não basta). */
  meaning: string;
  pronunciation: string;
  example: string;
  exampleTranslation: string;
  partOfSpeech: PartOfSpeech | null;
  gender: string;
  plural: string;
  category: string;
  tags: string[];
  /** De onde veio (livro, série, aula…). */
  source: string;
  german: GermanInfo | null;
  mandarin: MandarinInfo | null;
  srs: SrsState;
}

export type VocabInput = Omit<VocabEntry, keyof BaseEntity | 'srs'>;

const shortText = (n: number) => z.string().max(n);

export const vocabInputSchema = z.object({
  languageId: z.string().min(1),
  term: z.string().trim().min(1).max(300),
  translation: z.string().trim().max(500),
  meaning: shortText(2000),
  pronunciation: shortText(300),
  example: shortText(2000),
  exampleTranslation: shortText(2000),
  partOfSpeech: z.enum(PARTS_OF_SPEECH).nullable(),
  gender: shortText(40),
  plural: shortText(200),
  category: shortText(60),
  tags: z.array(z.string().trim().min(1).max(40)).max(30),
  source: shortText(300),
  german: z.object({ article: z.enum(GERMAN_ARTICLES).nullable(), cases: shortText(200), prepositions: shortText(200), government: shortText(500) }).nullable(),
  mandarin: z.object({ characters: shortText(100), pinyin: shortText(300), tones: shortText(100) }).nullable(),
}).refine((v) => v.translation.trim() || v.meaning.trim(), { path: ['translation'] });

export function emptyVocabInput(languageId: string, profile: LanguageProfile): VocabInput {
  return {
    languageId,
    term: '',
    translation: '',
    meaning: '',
    pronunciation: '',
    example: '',
    exampleTranslation: '',
    partOfSpeech: null,
    gender: '',
    plural: '',
    category: '',
    tags: [],
    source: '',
    german: profile === 'german' ? { article: null, cases: '', prepositions: '', government: '' } : null,
    mandarin: profile === 'mandarin' ? { characters: '', pinyin: '', tones: '' } : null,
  };
}

export function vocabInputOf(v: VocabEntry): VocabInput {
  const { languageId, term, translation, meaning, pronunciation, example, exampleTranslation, partOfSpeech, gender, plural, category, tags, source, german, mandarin } = v;
  return { languageId, term, translation, meaning, pronunciation, example, exampleTranslation, partOfSpeech, gender, plural, category, tags, source, german, mandarin };
}

/* ---------- Pinyin ---------- */

const TONE_MARKS: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

/** Põe a marca de tom numa sílaba (regra: a/e; senão o de "ou"; senão a última vogal). */
function markSyllable(syl: string, tone: number): string {
  const s = syl.replace(/v/g, 'ü').replace(/u:/g, 'ü');
  if (tone < 1 || tone > 4) return s;
  const lower = s.toLowerCase();
  let idx = lower.search(/[ae]/);
  if (idx < 0) idx = lower.indexOf('ou');
  if (idx < 0) {
    for (let i = lower.length - 1; i >= 0; i--)
      if ('iouü'.includes(lower[i]!)) {
        idx = i;
        break;
      }
  }
  if (idx < 0) return s;
  const ch = lower[idx]!;
  const marked = TONE_MARKS[ch]![tone - 1]!;
  const upper = s[idx] !== ch;
  return s.slice(0, idx) + (upper ? marked.toUpperCase() : marked) + s.slice(idx + 1);
}

/**
 * "ni3 hao3" → "nǐ hǎo"; "lv4" → "lǜ"; tom 5 ou 0 (neutro) fica sem marca.
 * Texto que já tem marcas é devolvido igual.
 */
export function numberedToPinyin(text: string): string {
  return text.replace(/([a-zA-ZüÜ:]+)([0-5])/g, (_, syl: string, n: string) => markSyllable(syl, Number(n)));
}

/** Números de tom de um pinyin digitado com números ("ni3 hao3" → "3 3"). */
export function tonesOf(text: string): string {
  return [...text.matchAll(/[a-zA-ZüÜ:]+([0-5])/g)].map((m) => m[1]).join(' ');
}

/* ---------- Pronúncia pela voz do aparelho ---------- */

/** Código para a voz do aparelho (Web Speech API). */
export function speechLang(code: string): string {
  const c = code.trim().toLowerCase();
  const map: Record<string, string> = { pt: 'pt-BR', en: 'en-US', de: 'de-DE', es: 'es-ES', zh: 'zh-CN', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR' };
  return map[c] ?? (c || 'en-US');
}

/* ---------- Gramática (Parte 10.4) ---------- */

export interface GrammarExercise {
  id: string;
  question: string;
  answer: string;
  result: 'pending' | 'right' | 'wrong';
}

export interface GrammarRule extends BaseEntity {
  languageId: string;
  title: string;
  /** Tema (ex.: verbos, casos, tempos verbais). */
  topic: string;
  level: CefrLevel | null;
  explanation: string;
  examples: string[];
  exercises: GrammarExercise[];
  notes: string;
  /** Entra na revisão espaçada (Parte 10.7). */
  srs: SrsState;
}

export type GrammarInput = Pick<GrammarRule, 'languageId' | 'title' | 'topic' | 'level' | 'explanation' | 'examples' | 'exercises' | 'notes'>;

export const grammarInputSchema = z.object({
  languageId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  topic: z.string().max(60),
  level: z.enum(CEFR_LEVELS).nullable(),
  explanation: z.string().max(20_000),
  examples: z.array(z.string().trim().min(1).max(1000)).max(50),
  exercises: z.array(z.object({ id: z.string(), question: z.string().trim().min(1).max(2000), answer: z.string().max(2000), result: z.enum(['pending', 'right', 'wrong']) })).max(200),
  notes: z.string().max(8000),
});

export function emptyGrammarInput(languageId: string): GrammarInput {
  return { languageId, title: '', topic: '', level: null, explanation: '', examples: [], exercises: [], notes: '' };
}

export function grammarInputOf(g: GrammarRule): GrammarInput {
  const { languageId, title, topic, level, explanation, examples, exercises, notes } = g;
  return { languageId, title, topic, level, explanation, examples, exercises, notes };
}

/* ---------- Revisão: baralhos do idioma (Parte 10.7) ---------- */

/**
 * Um "baralho" de revisão do idioma: tudo, a gramática, todo o vocabulário
 * (`category` ausente), uma categoria do vocabulário ou as palavras sem categoria (`null`).
 */
export type LanguageDeck = { kind: 'all' } | { kind: 'vocab'; category?: string | null } | { kind: 'grammar' };

export function deckKey(d: LanguageDeck): string {
  return d.kind === 'vocab' ? `vocab:${d.category === undefined ? '*' : (d.category ?? '')}` : d.kind;
}

/** O baralho inclui esta palavra? */
export function deckHasVocab(d: LanguageDeck, v: Pick<VocabEntry, 'category'>): boolean {
  if (d.kind === 'all') return true;
  if (d.kind !== 'vocab') return false;
  if (d.category === undefined) return true;
  return d.category === null ? !v.category : v.category === d.category;
}

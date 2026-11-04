import { z } from 'zod';
import type { BaseEntity } from './entity';
import type { DateKey } from './dates';

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

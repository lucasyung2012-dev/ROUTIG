import { z } from 'zod';
import { NAV_MODULE_IDS, type NavModuleId } from '@/app/modules';

export const SETTINGS_SCHEMA_VERSION = 1;

const navModuleId = z.enum(NAV_MODULE_IDS);

export const settingsSchema = z.object({
  schemaVersion: z.number().int().positive(),
  locale: z.enum(['pt-BR', 'en']),
  theme: z.enum(['auto', 'light', 'dark']),
  fontSize: z.enum(['small', 'normal', 'large', 'xlarge']),
  reduceMotion: z.boolean(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  onboarding: z.object({
    completed: z.boolean(),
    step: z.number().int().min(0),
  }),
  profile: z.object({
    displayName: z.string().max(60),
    bio: z.string().max(280),
    /** Foto do avatar guardada em `files` (opcional; sem foto, mostra a inicial). */
    avatarFileId: z.string().nullable(),
  }),
  nav: z.object({
    order: z.array(navModuleId),
    hidden: z.array(navModuleId),
    favorites: z.array(navModuleId),
    collapsed: z.boolean(),
  }),
  brand: z.object({
    vectorApproved: z.boolean(),
    approvedAt: z.string().nullable(),
  }),
  tips: z.object({
    enabled: z.boolean(),
    dismissed: z.array(z.string()),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;
export type ThemeSetting = Settings['theme'];
export type Locale = Settings['locale'];

export function defaultSettings(): Settings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    locale: 'pt-BR',
    theme: 'auto',
    fontSize: 'normal',
    reduceMotion: false,
    weekStartsOn: 1,
    onboarding: { completed: false, step: 0 },
    profile: { displayName: '', bio: '', avatarFileId: null },
    nav: { order: [...NAV_MODULE_IDS], hidden: [], favorites: [], collapsed: false },
    brand: { vectorApproved: false, approvedAt: null },
    tips: { enabled: true, dismissed: [] },
  };
}

/** Mantém a ordem do usuário, remove ids desconhecidos e acrescenta módulos novos no fim. */
export function normalizeOrder(order: readonly string[]): NavModuleId[] {
  const known = new Set<string>(NAV_MODULE_IDS);
  const seen = new Set<string>();
  const out: NavModuleId[] = [];
  for (const id of order) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id as NavModuleId);
    }
  }
  for (const id of NAV_MODULE_IDS) if (!seen.has(id)) out.push(id);
  return out;
}

/**
 * Converte qualquer versão salva para o formato atual. Campos ausentes recebem
 * o padrão; valores inválidos são trocados pelo padrão em vez de quebrar o app.
 */
export function migrateSettings(raw: unknown): Settings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;

  const merged = {
    ...base,
    ...pick(r, ['locale', 'theme', 'fontSize', 'reduceMotion', 'weekStartsOn']),
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    onboarding: { ...base.onboarding, ...asObject(r.onboarding) },
    profile: { ...base.profile, ...asObject(r.profile) },
    nav: { ...base.nav, ...asObject(r.nav) },
    brand: { ...base.brand, ...asObject(r.brand) },
    tips: { ...base.tips, ...asObject(r.tips) },
  };

  const nav = merged.nav as Record<string, unknown>;
  nav.order = normalizeOrder(Array.isArray(nav.order) ? (nav.order as string[]) : []);
  nav.hidden = filterIds(nav.hidden).filter((id) => id !== 'dashboard');
  nav.favorites = filterIds(nav.favorites);

  const parsed = settingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;

  // Recupera campo a campo: o que for válido fica, o resto volta ao padrão.
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(settingsSchema.shape) as (keyof Settings)[]) {
    const field = settingsSchema.shape[key].safeParse((merged as Record<string, unknown>)[key]);
    out[key] = field.success ? field.data : base[key];
  }
  return settingsSchema.parse(out);
}

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function filterIds(v: unknown): NavModuleId[] {
  if (!Array.isArray(v)) return [];
  const known = new Set<string>(NAV_MODULE_IDS);
  return [...new Set(v.filter((x): x is NavModuleId => typeof x === 'string' && known.has(x)))];
}

/** Módulos visíveis no menu, na ordem do usuário. */
export function visibleModules(s: Settings): NavModuleId[] {
  const hidden = new Set(s.nav.hidden);
  return s.nav.order.filter((id) => !hidden.has(id));
}

export function moveModule(order: NavModuleId[], id: NavModuleId, delta: -1 | 1): NavModuleId[] {
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  const a = next[i]!;
  next[i] = next[j]!;
  next[j] = a;
  return next;
}

export function toggleIn<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

import type { CSSProperties, ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { EntityRef } from '@/domain/entity';
import type { FocusEnvironment, FocusKind } from '@/domain/focus';
import { isOpenGoal } from '@/domain/goals';

/* ---------- Ambientes (Parte 13.1) ---------- */

/** Cada ambiente é desenhado só com CSS: nada para baixar, funciona sem internet. */
export const ENVIRONMENT_LOOK: Record<FocusEnvironment, { style: CSSProperties; text: string; decor: ReactNode }> = {
  minimal: {
    style: { background: '#0b0b0f' },
    text: 'text-white',
    decor: null,
  },
  library: {
    style: { background: 'radial-gradient(ellipse at 50% 18%, #6b4426 0%, #2b1a10 55%, #140c07 100%)' },
    text: 'text-amber-50',
    decor: (
      <>
        <div
          className="absolute inset-x-0 bottom-0 h-2/5 opacity-40"
          style={{ background: 'repeating-linear-gradient(90deg, #5a3a22 0 18px, #7a4f2c 18px 30px, #3d2716 30px 44px, #8a5a33 44px 52px, #4a2f1a 52px 70px)', maskImage: 'linear-gradient(to top, black, transparent)' }}
        />
        <div className="absolute left-1/2 top-[8%] h-40 w-40 -translate-x-1/2 rounded-full opacity-30 blur-3xl" style={{ background: '#ffb347' }} />
      </>
    ),
  },
  office: {
    style: { background: 'linear-gradient(160deg, #1d2a3a 0%, #0f1720 60%, #0a0f15 100%)' },
    text: 'text-slate-50',
    decor: (
      <>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="absolute right-[8%] top-[10%] h-56 w-40 rounded-2xl opacity-20" style={{ background: 'linear-gradient(180deg, #9fd3ff, #3a6d99)' }} />
      </>
    ),
  },
  nature: {
    style: { background: 'linear-gradient(180deg, #2f5d50 0%, #1f3d34 45%, #12251f 100%)' },
    text: 'text-emerald-50',
    decor: (
      <>
        <div className="absolute inset-x-0 bottom-0 h-1/3 opacity-50" style={{ background: 'radial-gradient(ellipse at 20% 100%, #3f7a5f 0 40%, transparent 41%), radial-gradient(ellipse at 70% 110%, #356b53 0 45%, transparent 46%)' }} />
        {[12, 30, 55, 72, 88].map((x, i) => (
          <span key={x} className="absolute h-2 w-2 animate-pulse rounded-full bg-emerald-100/40" style={{ left: `${x}%`, top: `${20 + ((i * 17) % 40)}%`, animationDelay: `${i * 0.7}s`, animationDuration: '4s' }} />
        ))}
      </>
    ),
  },
  study: {
    style: { background: 'radial-gradient(circle at 75% 20%, #4b3f8f 0%, #231d45 45%, #120f24 100%)' },
    text: 'text-indigo-50',
    decor: <div className="absolute right-[12%] top-[6%] h-64 w-64 rounded-full opacity-25 blur-3xl" style={{ background: '#ffd27a' }} />,
  },
};

/* ---------- Ligações (Parte 13.4: módulo e tarefa relacionados) ---------- */

export const FOCUS_REF_TYPES = ['subject', 'language', 'instrument', 'project', 'habit', 'goal'] as const;
export type FocusRefType = (typeof FOCUS_REF_TYPES)[number];

/** O tipo de ligação que combina com cada tipo de sessão (só sugere a ordem; qualquer ligação vale). */
export const KIND_REF: Partial<Record<FocusKind, FocusRefType>> = { study: 'subject', languages: 'language', music: 'instrument', project: 'project' };

export function useFocusRefOptions() {
  return useLiveQuery(async () => {
    const db = getDb();
    const years = new Map((await db.academicYears.toArray()).map((y) => [y.id, y.label]));
    const out: Record<FocusRefType, Array<{ id: string; name: string }>> = {
      subject: (await db.subjects.filter((s) => !s.deletedAt).toArray()).map((s) => ({ id: s.id, name: `${s.name}${years.get(s.yearId) ? ` · ${years.get(s.yearId)}` : ''}` })),
      language: (await db.languages.filter((l) => !l.deletedAt).toArray()).map((l) => ({ id: l.id, name: l.name })),
      instrument: (await db.instruments.filter((i) => !i.deletedAt).toArray()).map((i) => ({ id: i.id, name: i.name })),
      project: (await db.projects.filter((p) => !p.deletedAt).toArray()).map((p) => ({ id: p.id, name: p.name })),
      habit: (await db.habits.filter((h) => !h.deletedAt && !h.archived).toArray()).map((h) => ({ id: h.id, name: h.name })),
      goal: (await db.goals.filter((g) => !g.deletedAt && isOpenGoal(g)).toArray()).map((g) => ({ id: g.id, name: g.name })),
    };
    for (const k of FOCUS_REF_TYPES) out[k].sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, []);
}

export const refKeyOf = (r: EntityRef | null) => (r ? `${r.type}:${r.id}` : '');
export function parseRefKey(v: string): EntityRef | null {
  const i = v.indexOf(':');
  return i > 0 ? { type: v.slice(0, i), id: v.slice(i + 1) } : null;
}

export const REF_PATH: Record<FocusRefType, string> = { subject: '/academy/subjects/', language: '/languages/', instrument: '/music/', project: '/projects/', habit: '/habits/', goal: '/goals/' };

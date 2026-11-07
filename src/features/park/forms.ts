/**
 * Arquitetura de cada prédio (V2.1, seções 10 e 11): a mesma forma vale por fora (andares de
 * cima vistos do parque) e por dentro (planta de cada andar). Cada prédio tem a sua:
 * - planta do andar: átrio central com galerias, núcleo maciço com escada, corredor com salas dos
 *   dois lados, mezanino sobre um pé-direito alto na frente, planta livre com ilhas ou anel de
 *   salas em volta de um jardim interno;
 * - forma (redonda, quadrada, hexagonal, octogonal...), recuo entre andares e giro (torre torcida);
 * - fachada: pele de vidro, pedra com janelas, tijolo, brises, ripas de madeira ou painéis com
 *   janela em fita.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import type { Builder, Kit } from './kit';

export type Plan = 'atrium' | 'core' | 'corridor' | 'side' | 'open' | 'garden';
export type Facade = 'glass' | 'stone' | 'brick' | 'wood' | 'louver' | 'panel';

export interface Form {
  /** Lados do polígono (0 = redondo). */
  sides: number;
  /** Giro do polígono (rad). */
  rot: number;
  /** Quanto cada andar encolhe em relação ao de baixo (0 = torre reta). */
  setback: number;
  /** Giro de cada andar em relação ao de baixo (torre torcida). */
  twist: number;
  plan: Plan;
  facade: Facade;
  /** Cor da estrutura da fachada (pedra, tijolo, madeira, brises, painéis). */
  frame: string;
}

export const FORMS: Record<ModuleId, Form> = {
  dashboard: { sides: 12, rot: Math.PI / 12, setback: 0.08, twist: 0, plan: 'atrium', facade: 'glass', frame: '#AAB6C4' },
  library: { sides: 8, rot: Math.PI / 8, setback: 0.04, twist: 0, plan: 'atrium', facade: 'stone', frame: '#DCD3C2' },
  calendar: { sides: 0, rot: 0, setback: 0, twist: 0, plan: 'core', facade: 'panel', frame: '#E8EDF3' },
  insights: { sides: 4, rot: Math.PI / 4, setback: 0.03, twist: 0.24, plan: 'core', facade: 'glass', frame: '#C9CED8' },
  settings: { sides: 6, rot: Math.PI / 6, setback: 0.05, twist: 0, plan: 'core', facade: 'louver', frame: '#B9C3CF' },
  tasks: { sides: 4, rot: Math.PI / 4, setback: 0, twist: 0, plan: 'corridor', facade: 'louver', frame: '#3A4656' },
  finance: { sides: 6, rot: Math.PI / 6, setback: 0.07, twist: 0, plan: 'corridor', facade: 'stone', frame: '#D9D2C2' },
  music: { sides: 0, rot: 0, setback: 0.06, twist: 0, plan: 'corridor', facade: 'wood', frame: '#9A6B47' },
  academy: { sides: 4, rot: Math.PI / 4, setback: 0.06, twist: 0, plan: 'side', facade: 'brick', frame: '#A65A3F' },
  projects: { sides: 6, rot: Math.PI / 6, setback: 0, twist: 0.14, plan: 'side', facade: 'panel', frame: '#F1E7DC' },
  notes: { sides: 5, rot: 0, setback: 0, twist: 0, plan: 'open', facade: 'wood', frame: '#B08560' },
  inbox: { sides: 8, rot: Math.PI / 8, setback: 0.06, twist: 0, plan: 'open', facade: 'glass', frame: '#C3CDD8' },
  profile: { sides: 8, rot: Math.PI / 8, setback: 0.1, twist: 0, plan: 'open', facade: 'stone', frame: '#E6DCCB' },
  sports: { sides: 8, rot: Math.PI / 8, setback: 0, twist: 0, plan: 'open', facade: 'louver', frame: '#2F3B4A' },
  languages: { sides: 8, rot: Math.PI / 8, setback: 0.06, twist: 0, plan: 'garden', facade: 'brick', frame: '#C27A55' },
  habits: { sides: 12, rot: Math.PI / 12, setback: 0.05, twist: 0, plan: 'garden', facade: 'glass', frame: '#7C9A84' },
  focus: { sides: 0, rot: 0, setback: 0.1, twist: 0, plan: 'garden', facade: 'wood', frame: '#B9905F' },
  goals: { sides: 6, rot: Math.PI / 6, setback: 0.12, twist: 0, plan: 'garden', facade: 'stone', frame: '#E9DDB8' },
};

/** Fração do raio do térreo que o andar L ocupa (L ≥ 1). */
export const levelScale = (f: Form, L: number) => (L <= 0 ? 1 : 0.94 * (1 - f.setback) ** (L - 1));
/** Giro do polígono no andar L. */
export const levelRot = (f: Form, L: number) => f.rot + f.twist * L;

/** Raio do polígono (circunscrito R) na direção `a` (ângulo de atan2(x, z)). */
export function polyR(sides: number, rot: number, R: number, a: number): number {
  if (sides < 3) return R;
  const sec = (Math.PI * 2) / sides;
  let t = (a - rot) % sec;
  if (t < 0) t += sec;
  return (R * Math.cos(Math.PI / sides)) / Math.cos(t - sec / 2);
}

/** Menor raio do polígono (apótema). */
export const apothem = (sides: number, R: number) => (sides >= 3 ? R * Math.cos(Math.PI / sides) : R);

/** Faces da fachada (redondo vira um polígono fino); cada face: ângulo da normal, apótema, largura. */
export function faces(sides: number, rot: number, R: number): Array<{ phi: number; a: number; len: number }> {
  const n = sides >= 3 ? sides : Math.max(16, Math.min(40, Math.round((Math.PI * 2 * R) / 3.2)));
  const r0 = sides >= 3 ? rot : Math.PI / n;
  const out: Array<{ phi: number; a: number; len: number }> = [];
  for (let k = 0; k < n; k++) out.push({ phi: r0 + ((k + 0.5) / n) * Math.PI * 2, a: R * Math.cos(Math.PI / n), len: 2 * R * Math.sin(Math.PI / n) });
  return out;
}

/** Contorno do polígono no plano (x, z), com `n` pontos no redondo. */
export function outline(sides: number, rot: number, R: number): Array<[number, number]> {
  const n = sides >= 3 ? sides : 48;
  const r0 = sides >= 3 ? rot : 0;
  return Array.from({ length: n }, (_, k) => {
    const t = r0 + (k / n) * Math.PI * 2;
    return [Math.sin(t) * R, Math.cos(t) * R] as [number, number];
  });
}

/** Recorta um contorno pelo semiplano z ≤ zMax (mezanino). */
export function clipZ(pts: Array<[number, number]>, zMax: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const pin = p[1] <= zMax;
    const qin = q[1] <= zMax;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = (zMax - p[1]) / (q[1] - p[1]);
      out.push([p[0] + (q[0] - p[0]) * t, zMax]);
    }
  }
  return out;
}

/**
 * Laje horizontal com a forma dada (e furos), espessura `thick`, topo em `y`.
 * Os contornos estão em (x, z) do mundo.
 */
export function slab(outer: Array<[number, number]>, holes: Array<Array<[number, number]>>, y: number, thick: number): THREE.BufferGeometry {
  // A forma fica no plano XY com y = -z; girando -90° em X, (x, y) vira (x, -y→z).
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  holes.forEach((h) => shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z)))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y - thick, 0);
  return geo;
}

/** Anel circular como contorno (para furos). */
export const circle = (r: number, n = 40): Array<[number, number]> => Array.from({ length: n }, (_, k) => [Math.sin((k / n) * Math.PI * 2) * r, Math.cos((k / n) * Math.PI * 2) * r] as [number, number]);

export interface FacadeMats {
  glass: THREE.Material;
  frame: THREE.Material;
  metal: THREE.Material;
  /** Luz das salas vista de fora à noite (só por fora). */
  glow?: THREE.Material;
}

export function facadeMats(kit: Kit, f: Form): FacadeMats {
  return {
    glass: kit.mat(f.facade === 'glass' || f.facade === 'louver' ? '#B9DCEF' : '#CFE3EE', { glass: true, side: THREE.DoubleSide }),
    frame: kit.mat(f.frame, { rough: f.facade === 'glass' || f.facade === 'louver' ? 0.35 : 0.85, metal: f.facade === 'louver' || f.facade === 'glass' ? 0.6 : 0 }),
    metal: kit.mat('#9AA6B5', { metal: 0.85, rough: 0.3 }),
  };
}

/**
 * Fachada de um andar no tipo do prédio, face a face. `doors` são ângulos onde a face mais
 * próxima ganha uma porta de 1,8 m (para o terraço ou a ponte do elevador). Devolve os ângulos
 * reais das portas (centro das faces escolhidas).
 */
export function facade(b: Builder, f: Form, m: FacadeMats, R: number, rot: number, y: number, h: number, doors: number[] = []): number[] {
  const fs = faces(f.sides, rot, R);
  // Cada porta fica na face que o ângulo cruza, no ponto exato (puxada para dentro da face se cair no canto).
  const dw = 0.9;
  const doorAt = new Map<number, number>();
  for (const d of doors) {
    let best = 0;
    let bd = Infinity;
    fs.forEach((fc, i) => {
      const diff = Math.abs(Math.atan2(Math.sin(fc.phi - d), Math.cos(fc.phi - d)));
      if (diff < bd && !doorAt.has(i)) {
        bd = diff;
        best = i;
      }
    });
    const fc = fs[best]!;
    const lim = fc.len / 2 - dw - 0.1;
    if (lim < 0) continue;
    const t = Math.atan2(Math.sin(d - fc.phi), Math.cos(d - fc.phi));
    doorAt.set(best, Math.max(-lim, Math.min(lim, fc.a * Math.tan(t))));
  }
  const put = (fc: { phi: number; a: number }, mat: THREE.Material, geo: THREE.BufferGeometry, lx: number, ly: number, lz: number) => {
    const c = Math.cos(fc.phi);
    const s = Math.sin(fc.phi);
    b.add(mat, geo, [s * (fc.a + lz) + c * lx, y + ly, c * (fc.a + lz) - s * lx], [0, fc.phi, 0]);
  };
  // Um trecho [x0, x1] da face, no tipo da fachada.
  const span = (fc: { phi: number; a: number }, x0: number, x1: number, top: number) => {
    const w = x1 - x0;
    if (w < 0.05) return;
    const cx = (x0 + x1) / 2;
    switch (f.facade) {
      case 'glass':
      case 'louver':
      case 'wood': {
        put(fc, m.glass, new THREE.BoxGeometry(w, top, 0.04), cx, top / 2, 0);
        const n = Math.max(1, Math.round(w / 1.6));
        for (let i = 0; i <= n; i++) put(fc, m.metal, new THREE.BoxGeometry(0.08, top, 0.16), x0 + (i / n) * w, top / 2, 0);
        put(fc, m.metal, new THREE.BoxGeometry(w, 0.06, 0.12), cx, 1.0, 0.02);
        if (f.facade === 'louver') {
          const k = Math.max(1, Math.round(w / 0.7));
          for (let i = 0; i < k; i++) put(fc, m.frame, new THREE.BoxGeometry(0.05, top, 0.55), x0 + ((i + 0.5) / k) * w, top / 2, 0.42);
        }
        if (f.facade === 'wood') {
          const k = Math.max(1, Math.round(w / 0.42));
          for (let i = 0; i < k; i++) if (i % 3 !== 1) put(fc, m.frame, new THREE.BoxGeometry(0.07, top, 0.12), x0 + ((i + 0.5) / k) * w, top / 2, 0.22);
        }
        break;
      }
      case 'stone':
      case 'brick': {
        // Parapeito e verga maciços, janelas altas entre pilares.
        put(fc, m.frame, new THREE.BoxGeometry(w, 0.9, 0.3), cx, 0.45, 0);
        put(fc, m.frame, new THREE.BoxGeometry(w, Math.max(0.3, top - 3.0), 0.3), cx, 3.0 + Math.max(0.3, top - 3.0) / 2, 0);
        const n = Math.max(1, Math.round(w / 2.2));
        const pw = f.facade === 'stone' ? 0.55 : 0.45;
        for (let i = 0; i <= n; i++) put(fc, m.frame, new THREE.BoxGeometry(pw, top, 0.36), x0 + (i / n) * w, top / 2, 0.02);
        put(fc, m.glass, new THREE.BoxGeometry(w, 2.1, 0.04), cx, 1.95, -0.05);
        for (let i = 0; i < n; i++) put(fc, m.metal, new THREE.BoxGeometry(0.05, 2.1, 0.08), x0 + ((i + 0.5) / n) * w, 1.95, -0.03);
        if (f.facade === 'stone') put(fc, m.frame, new THREE.BoxGeometry(w + 0.1, 0.12, 0.5), cx, 0.92, 0.1);
        break;
      }
      case 'panel': {
        // Painéis claros com uma janela em fita contínua.
        put(fc, m.frame, new THREE.BoxGeometry(w, 0.95, 0.18), cx, 0.475, 0);
        put(fc, m.frame, new THREE.BoxGeometry(w, Math.max(0.3, top - 2.75), 0.18), cx, 2.75 + Math.max(0.3, top - 2.75) / 2, 0);
        put(fc, m.glass, new THREE.BoxGeometry(w, 1.8, 0.04), cx, 1.85, 0);
        const n = Math.max(1, Math.round(w / 2.4));
        for (let i = 0; i <= n; i++) put(fc, m.metal, new THREE.BoxGeometry(0.06, 1.8, 0.1), x0 + (i / n) * w, 1.85, 0);
        break;
      }
    }
  };
  const out: number[] = [];
  fs.forEach((fc, i) => {
    const half = fc.len / 2 + 0.02;
    const lx = doorAt.get(i);
    if (lx !== undefined) {
      span(fc, -half, lx - dw, h);
      span(fc, lx + dw, half, h);
      // Verga sobre a porta, batentes e soleira.
      put(fc, m.frame, new THREE.BoxGeometry(dw * 2, h - 2.4, 0.3), lx, 2.4 + (h - 2.4) / 2, 0);
      for (const s of [-1, 1]) put(fc, m.metal, new THREE.BoxGeometry(0.1, 2.4, 0.3), lx + s * dw, 1.2, 0);
      put(fc, m.metal, new THREE.BoxGeometry(dw * 2, 0.03, 0.4), lx, 0.015, 0);
      out.push(fc.phi + Math.atan2(lx, fc.a));
    } else span(fc, -half, half, h);
  });
  return out;
}

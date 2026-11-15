/**
 * Arquitetura de cada prédio (V2.1, seções 10 e 11): a mesma forma vale por fora (andares de
 * cima vistos do parque) e por dentro (planta de cada andar). Cada prédio tem a sua:
 * - planta do andar: átrio central com galerias, núcleo maciço com escada, corredor com salas dos
 *   dois lados, mezanino sobre um pé-direito alto na frente, planta livre com ilhas ou anel de
 *   salas em volta de um jardim interno;
 * - fachada: pele de vidro, pedra com janelas, tijolo, brises, ripas de madeira ou painéis com
 *   janela em fita, desenhada trecho a trecho ao longo das paredes (facadeAlong, wallsAlong).
 * A forma e o tamanho (a planta de cada nível, alas mais baixas, átrio) vêm da volumetria do
 * prédio (massing.ts, outline.ts). `sides`, `rot`, `setback` e `twist` são do desenho antigo em
 * polígono (polyR, outline, terraceSpots), mantidos para quem ainda usa esses ajudantes.
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import type { Builder, Kit } from './kit';
import { alongRun, entranceRun, volPoly, type Vol, type WallRun } from './outline';

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
  /** Planta dos andares de cima, quando difere da do térreo (Focus: mezanino parcial sobre o salão). */
  upper?: Plan;
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
  academy: { sides: 4, rot: Math.PI / 4, setback: 0.06, twist: 0, plan: 'atrium', facade: 'brick', frame: '#A65A3F' },
  projects: { sides: 6, rot: Math.PI / 6, setback: 0, twist: 0, plan: 'side', facade: 'panel', frame: '#F1E7DC' },
  notes: { sides: 5, rot: 0, setback: 0, twist: 0, plan: 'open', facade: 'wood', frame: '#B08560' },
  inbox: { sides: 8, rot: Math.PI / 8, setback: 0.06, twist: 0, plan: 'open', facade: 'glass', frame: '#C3CDD8' },
  profile: { sides: 8, rot: Math.PI / 8, setback: 0.1, twist: 0, plan: 'open', facade: 'stone', frame: '#E6DCCB' },
  sports: { sides: 8, rot: Math.PI / 8, setback: 0, twist: 0, plan: 'open', facade: 'louver', frame: '#2F3B4A' },
  languages: { sides: 8, rot: Math.PI / 8, setback: 0.06, twist: 0, plan: 'garden', facade: 'brick', frame: '#C27A55' },
  habits: { sides: 12, rot: Math.PI / 12, setback: 0.05, twist: 0, plan: 'garden', facade: 'glass', frame: '#7C9A84' },
  focus: { sides: 0, rot: 0, setback: 0.1, twist: 0, plan: 'garden', upper: 'side', facade: 'wood', frame: '#B9905F' },
  goals: { sides: 6, rot: Math.PI / 6, setback: 0.12, twist: 0, plan: 'garden', facade: 'stone', frame: '#E9DDB8' },
};

/** Planta dos andares de cima (a do térreo, salvo quando o prédio define outra). */
export const upperPlan = (f: Form): Plan => f.upper ?? f.plan;

/**
 * Prédios com terraço aberto na cobertura (programa aprovado dos prédios do Campus): o último nível
 * do interior, alcançado pelo mesmo elevador (e pela escada do núcleo, onde há), a céu aberto, com
 * guarda-corpo em volta, bancos, floreiras e a vista. Por fora, a cobertura mostra o mesmo terraço.
 */
export const ROOF_TERRACES: readonly ModuleId[] = ['academy', 'languages', 'library', 'calendar', 'tasks', 'projects', 'goals', 'insights'];
export const hasRoofTerrace = (id: ModuleId): boolean => ROOF_TERRACES.includes(id);

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

/** Referencial de um trecho reto de fachada: ponto de referência e ângulo da normal para fora. */
interface Frame {
  cx: number;
  cz: number;
  phi: number;
}

/** Peça no referencial do trecho: `lx` ao longo da parede, `lz` para fora, `ly` para cima a partir de `y`. */
function putIn(b: Builder, fr: Frame, y: number, mat: THREE.Material, geo: THREE.BufferGeometry, lx: number, ly: number, lz: number) {
  const c = Math.cos(fr.phi);
  const s = Math.sin(fr.phi);
  b.add(mat, geo, [fr.cx + s * lz + c * lx, y + ly, fr.cz + c * lz - s * lx], [0, fr.phi, 0]);
}

/** Um pedaço [x0, x1] do trecho, no tipo da fachada do prédio, com altura `top`. */
function facadeSpan(b: Builder, f: Form, m: FacadeMats, fr: Frame, y: number, x0: number, x1: number, top: number) {
  const w = x1 - x0;
  if (w < 0.05 || top < 0.3) return;
  const cx = (x0 + x1) / 2;
  const put = (mat: THREE.Material, geo: THREE.BufferGeometry, lx: number, ly: number, lz: number) => putIn(b, fr, y, mat, geo, lx, ly, lz);
  switch (f.facade) {
    case 'glass':
    case 'louver':
    case 'wood': {
      put(m.glass, new THREE.BoxGeometry(w, top, 0.04), cx, top / 2, 0);
      const n = Math.max(1, Math.round(w / 1.6));
      for (let i = 0; i <= n; i++) put(m.metal, new THREE.BoxGeometry(0.08, top, 0.16), x0 + (i / n) * w, top / 2, 0);
      put(m.metal, new THREE.BoxGeometry(w, 0.06, 0.12), cx, Math.min(1.0, top - 0.1), 0.02);
      if (f.facade === 'louver') {
        const k = Math.max(1, Math.round(w / 0.7));
        for (let i = 0; i < k; i++) put(m.frame, new THREE.BoxGeometry(0.05, top, 0.55), x0 + ((i + 0.5) / k) * w, top / 2, 0.42);
      }
      if (f.facade === 'wood') {
        const k = Math.max(1, Math.round(w / 0.42));
        for (let i = 0; i < k; i++) if (i % 3 !== 1) put(m.frame, new THREE.BoxGeometry(0.07, top, 0.12), x0 + ((i + 0.5) / k) * w, top / 2, 0.22);
      }
      break;
    }
    case 'stone':
    case 'brick': {
      // Parapeito e verga maciços, janelas altas entre pilares.
      if (top < 3.4) {
        put(m.frame, new THREE.BoxGeometry(w, top, 0.3), cx, top / 2, 0);
        break;
      }
      put(m.frame, new THREE.BoxGeometry(w, 0.9, 0.3), cx, 0.45, 0);
      put(m.frame, new THREE.BoxGeometry(w, Math.max(0.3, top - 3.0), 0.3), cx, 3.0 + Math.max(0.3, top - 3.0) / 2, 0);
      const n = Math.max(1, Math.round(w / 2.2));
      const pw = f.facade === 'stone' ? 0.55 : 0.45;
      for (let i = 0; i <= n; i++) put(m.frame, new THREE.BoxGeometry(pw, top, 0.36), x0 + (i / n) * w, top / 2, 0.02);
      put(m.glass, new THREE.BoxGeometry(w, 2.1, 0.04), cx, 1.95, -0.05);
      for (let i = 0; i < n; i++) put(m.metal, new THREE.BoxGeometry(0.05, 2.1, 0.08), x0 + ((i + 0.5) / n) * w, 1.95, -0.03);
      if (f.facade === 'stone') put(m.frame, new THREE.BoxGeometry(w + 0.1, 0.12, 0.5), cx, 0.92, 0.1);
      break;
    }
    case 'panel': {
      // Painéis claros com uma janela em fita contínua.
      if (top < 3.1) {
        put(m.frame, new THREE.BoxGeometry(w, top, 0.18), cx, top / 2, 0);
        break;
      }
      put(m.frame, new THREE.BoxGeometry(w, 0.95, 0.18), cx, 0.475, 0);
      put(m.frame, new THREE.BoxGeometry(w, Math.max(0.3, top - 2.75), 0.18), cx, 2.75 + Math.max(0.3, top - 2.75) / 2, 0);
      put(m.glass, new THREE.BoxGeometry(w, 1.8, 0.04), cx, 1.85, 0);
      const n = Math.max(1, Math.round(w / 2.4));
      for (let i = 0; i <= n; i++) put(m.metal, new THREE.BoxGeometry(0.06, 1.8, 0.1), x0 + (i / n) * w, 1.85, 0);
      break;
    }
  }
}

/** Porta de 2 × `dw` m no trecho (verga, batentes e soleira) em `lx`. */
function doorIn(b: Builder, m: FacadeMats, fr: Frame, y: number, lx: number, h: number, dw: number) {
  putIn(b, fr, y, m.frame, new THREE.BoxGeometry(dw * 2, Math.max(0.1, h - 2.4), 0.3), lx, 2.4 + Math.max(0.1, h - 2.4) / 2, 0);
  for (const s of [-1, 1]) putIn(b, fr, y, m.metal, new THREE.BoxGeometry(0.1, 2.4, 0.3), lx + s * dw, 1.2, 0);
  putIn(b, fr, y, m.metal, new THREE.BoxGeometry(dw * 2, 0.03, 0.4), lx, 0.015, 0);
}

/**
 * Fachada de um trecho reto de parede (de a até b, normal para fora n), no tipo do prédio, de `y`
 * até `y + h`. Paredes altas (térreo de pé-direito alto) repetem a fachada em faixas de até 4,8 m,
 * uma por galeria. `doors` são posições ao longo do trecho (metros a partir de a) onde fica uma
 * porta de 2 × `dw` m (só na faixa de baixo).
 */
export function facadeAlong(b: Builder, f: Form, m: FacadeMats, r: { ax: number; az: number; bx: number; bz: number; nx: number; nz: number }, y: number, h: number, doors: readonly number[] = [], dw = 0.9) {
  const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
  if (len < 0.05 || h < 0.05) return;
  const fr: Frame = { cx: (r.ax + r.bx) / 2, cz: (r.az + r.bz) / 2, phi: Math.atan2(r.nx, r.nz) };
  // Eixo ao longo da parede no referencial (cos φ, −sen φ): a e b viram −len/2 ou +len/2.
  const tx = Math.cos(fr.phi);
  const tz = -Math.sin(fr.phi);
  const sa = (r.ax - fr.cx) * tx + (r.az - fr.cz) * tz;
  const dir = sa < 0 ? 1 : -1;
  const half = len / 2 + 0.02;
  const bands = Math.max(1, Math.round(h / 4.6));
  const bh = h / bands;
  const ds = doors
    .map((d) => dir * (d - len / 2))
    .filter((lx) => Math.abs(lx) <= half - dw - 0.1)
    .sort((u, v) => u - v);
  for (let k = 0; k < bands; k++) {
    const yy = y + k * bh;
    if (k > 0 || !ds.length) {
      facadeSpan(b, f, m, fr, yy, -half, half, bh);
      continue;
    }
    let x = -half;
    for (const lx of ds) {
      facadeSpan(b, f, m, fr, yy, x, lx - dw, bh);
      doorIn(b, m, fr, yy, lx, bh, dw);
      x = lx + dw;
    }
    facadeSpan(b, f, m, fr, yy, x, half, bh);
  }
}

/**
 * Fachada de um andar no tipo do prédio, face a face de um polígono regular. `doors` são ângulos
 * onde a face mais próxima ganha uma porta de 1,8 m. Devolve os ângulos reais das portas.
 */
export function facade(b: Builder, f: Form, m: FacadeMats, R: number, rot: number, y: number, h: number, doors: number[] = []): number[] {
  const fs = faces(f.sides, rot, R);
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
  const out: number[] = [];
  fs.forEach((fc, i) => {
    const fr: Frame = { cx: Math.sin(fc.phi) * fc.a, cz: Math.cos(fc.phi) * fc.a, phi: fc.phi };
    const half = fc.len / 2 + 0.02;
    const lx = doorAt.get(i);
    if (lx !== undefined) {
      facadeSpan(b, f, m, fr, y, -half, lx - dw, h);
      facadeSpan(b, f, m, fr, y, lx + dw, half, h);
      doorIn(b, m, fr, y, lx, h, dw);
      out.push(fc.phi + Math.atan2(lx, fc.a));
    } else facadeSpan(b, f, m, fr, y, -half, half, h);
  });
  return out;
}

/** Peça do terraço da cobertura: floreira e banco junto ao guarda-corpo; árvore e mesa no meio. */
export interface TerraceSpot {
  kind: 'planter' | 'bench' | 'tree' | 'table';
  x: number;
  z: number;
  /** Para onde a peça olha (banco: para fora, para a vista). */
  face: number;
}

/**
 * Onde ficam as peças do terraço da cobertura do andar `L` (raio circunscrito `R`), o mesmo desenho
 * por dentro e por fora: floreiras e bancos alternados a 1,1 m da borda, de frente para a vista,
 * nunca na ponte do elevador (direção `back`, ângulo de atan2(x, z)) nem nos cantos; árvores em
 * vasos e mesas no meio, fora do eixo da ponte e longe do vão/núcleo do meio (raio `hole`).
 */
export function terraceSpots(f: Form, L: number, R: number, hole: number, back: number): TerraceSpot[] {
  const rot = f.sides >= 3 ? levelRot(f, L) : 0;
  const sec = f.sides >= 3 ? (Math.PI * 2) / f.sides : 0;
  const apo = apothem(f.sides, R);
  const sb = Math.sin(back);
  const cb = Math.cos(back);
  const lateral = (x: number, z: number) => Math.abs(x * cb - z * sb);
  const out: TerraceSpot[] = [];
  const d = apo - 1.1;
  const half = sec ? d * Math.tan(sec / 2) : Infinity;
  const n = Math.max(8, Math.round((Math.PI * 2 * apo) / 3.4));
  for (let k = 0; k < n; k++) {
    const a = rot + ((k + 0.5) / n) * Math.PI * 2;
    // Normal da face que o ângulo cruza (redondo: o próprio ângulo) e a posição ao longo dela.
    let phi = a;
    if (sec) {
      let t = (a - rot) % sec;
      if (t < 0) t += sec;
      phi = a - t + sec / 2;
    }
    const s = d * Math.tan(a - phi);
    if (Math.abs(s) + 1.0 > half) continue;
    const x = Math.sin(phi) * d + Math.cos(phi) * s;
    const z = Math.cos(phi) * d - Math.sin(phi) * s;
    if (x * sb + z * cb > 0 && lateral(x, z) < 2.6) continue;
    out.push({ kind: k % 2 ? 'bench' : 'planter', x, z, face: phi });
  }
  const r0 = Math.max(hole, 2.5);
  const r1 = apo - 2.8;
  if (r1 - r0 > 2.4) {
    const rt = (r0 + r1) / 2;
    const m = Math.max(3, Math.floor((Math.PI * 2 * rt) / 6));
    for (let j = 0; j < m; j++) {
      const a = rot + ((j + 0.25) / m) * Math.PI * 2;
      const x = Math.sin(a) * rt;
      const z = Math.cos(a) * rt;
      if (lateral(x, z) < 2.4) continue;
      out.push({ kind: j % 2 ? 'table' : 'tree', x, z, face: a });
    }
  }
  return out;
}

/**
 * Trechos de guarda-corpo ao longo de um contorno fechado, em pedaços de até `step` m, sem os
 * pedaços cujo meio cai onde `skip` diz (a passagem da ponte do elevador).
 */
export function railRuns(pts: Array<[number, number]>, skip: (x: number, z: number) => boolean, step = 0.8): Array<Array<[number, number]>> {
  const runs: Array<Array<[number, number]>> = [];
  let run: Array<[number, number]> = [];
  const flush = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
    for (let k = 0; k < n; k++) {
      const a: [number, number] = [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n];
      const c: [number, number] = [p[0] + ((q[0] - p[0]) * (k + 1)) / n, p[1] + ((q[1] - p[1]) * (k + 1)) / n];
      if (skip((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)) {
        flush();
        continue;
      }
      if (!run.length) run.push(a);
      run.push(c);
    }
  }
  flush();
  return runs;
}

/**
 * Bloco (ou prisma aberto, sem tampas) com a forma do volume, recuado `inset` m das paredes, de
 * y = 0 a y = h, já no lugar do volume (planta local do prédio).
 */
export function volGeo(v: Vol, inset: number, h: number, open = false): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  if (v.kind === 'rect') {
    geo = new THREE.BoxGeometry(Math.max(0.1, v.w - inset * 2), h, Math.max(0.1, v.d - inset * 2));
    geo.rotateY(v.rot ?? 0);
  } else if (v.kind === 'circle') geo = new THREE.CylinderGeometry(Math.max(0.1, v.r - inset), Math.max(0.1, v.r - inset), h, 40, 1, open);
  else {
    const r = Math.max(0.1, v.r - inset / Math.cos(Math.PI / v.sides));
    geo = new THREE.CylinderGeometry(r, r, h, v.sides, 1, open, v.rot ?? 0);
  }
  geo.translate(v.cx, h / 2, v.cz);
  return geo;
}

/** Laje com a forma do volume (e furos), topo em `y`. */
export const volSlab = (v: Vol, y: number, thick: number, holes: Array<Array<[number, number]>> = [], grow = 0): THREE.BufferGeometry =>
  slab(grow ? volPoly(v).map(([x, z]) => [v.cx + (x - v.cx) * (1 + grow / Math.max(1, Math.hypot(x - v.cx, z - v.cz))), v.cz + (z - v.cz) * (1 + grow / Math.max(1, Math.hypot(x - v.cx, z - v.cz)))] as [number, number]) : volPoly(v), holes, y, thick);

/** Peça reta ao longo de um trecho de parede (parapeito, friso, guarda-corpo), de `y` a `y + h`, com espessura `t`. */
export function alongGeo(r: { ax: number; az: number; bx: number; bz: number }, y: number, h: number, t: number, out = 0, nx = 0, nz = 0): { geo: THREE.BufferGeometry; pos: [number, number, number]; rot: [number, number, number] } {
  const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
  return { geo: new THREE.BoxGeometry(t, h, Math.max(0.01, len)), pos: [(r.ax + r.bx) / 2 + nx * out, y + h / 2, (r.az + r.bz) / 2 + nz * out], rot: [0, Math.atan2(r.bx - r.ax, r.bz - r.az), 0] };
}

/**
 * Paredes de um nível por trecho (outline.ts), no tipo da fachada do prédio: cada trecho de `from`
 * até a altura do volume dono. O trecho da frente que cruza x = 0 ganha a fachada envidraçada da
 * entrada (largura `entry`, até 5,2 m de altura) com montantes e travessa; acima dela, a fachada
 * continua. Igual por fora (térreo do prédio) e por dentro (salão do térreo).
 */
export function wallsAlong(b: Builder, f: Form, fm: FacadeMats, runs: readonly WallRun[], hOf: (i: number) => number, entry: number, door: { glass: THREE.Material; dark: THREE.Material }, y0 = 0): void {
  const ent = entry > 0 ? entranceRun(runs) : null;
  for (const r of runs) {
    const top = hOf(r.vol);
    if (r !== ent) {
      facadeAlong(b, f, fm, r, y0 + r.from, top - r.from);
      continue;
    }
    const gh = Math.min(5.2, top - 0.6);
    const zAt0 = r.az + ((r.bz - r.az) * (0 - r.ax)) / (r.bx - r.ax || 1);
    const p0 = alongRun(r, 0, zAt0);
    const e = Math.min(entry, r.len - 1.2);
    const ux = (r.bx - r.ax) / r.len;
    const uz = (r.bz - r.az) / r.len;
    const s0 = Math.max(0, p0 - e / 2);
    const s1 = Math.min(r.len, p0 + e / 2);
    const A = { x: r.ax + ux * s0, z: r.az + uz * s0 };
    const B = { x: r.ax + ux * s1, z: r.az + uz * s1 };
    facadeAlong(b, f, fm, { ...r, bx: A.x, bz: A.z }, y0, top);
    facadeAlong(b, f, fm, { ...r, ax: B.x, az: B.z }, y0, top);
    const mid = { ax: A.x, az: A.z, bx: B.x, bz: B.z };
    const w = alongGeo(mid, y0, gh, 0.08);
    b.add(door.glass, w.geo, w.pos, w.rot);
    const n = Math.max(2, Math.round((s1 - s0) / 2));
    for (let k = 0; k <= n; k++) {
      const s = s0 + ((s1 - s0) * k) / n;
      // O vão da porta de correr (2,4 m) fica sem montante.
      if (Math.abs(r.ax + ux * s) < 1.4) continue;
      b.add(door.dark, new THREE.BoxGeometry(0.12, gh, 0.12), [r.ax + ux * s + r.nx * 0.05, y0 + gh / 2, r.az + uz * s + r.nz * 0.05]);
    }
    const tr = alongGeo(mid, y0 + gh, 0.25, 0.3);
    b.add(door.dark, tr.geo, tr.pos, tr.rot);
    if (top - gh > 0.6) facadeAlong(b, f, fm, { ...r, ...mid }, y0 + gh + 0.25, top - gh - 0.25);
  }
}

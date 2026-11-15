/**
 * Jardins dos prédios (15/11/2026): paisagismo temático ao lado da chegada de cada prédio, logo
 * fora do lote (nunca a menos de 2 m da borda dele) e nunca na frente da entrada. Cada jardim procura
 * um gramado livre e quase plano dos dois lados do eixo da entrada (e, se não houver, mais em volta
 * do lote); cada peça confere o próprio chão (caminho, água, lote, peças sólidas, desnível) e, se não
 * couber, fica de fora. Tudo num Builder só (poucas malhas por material), sem textura e sem nada
 * calculado por quadro. Bancos, banquetas e mesas com assento viram assentos de verdade (Seat).
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { PARK_BUILDINGS, facingOf, heightAt, inWater, isFreeGround, type ParkBuilding, type ParkRegion } from '@/domain/park';
import { Builder, type Kit, type MatOpts } from './kit';
import { frame } from './props';
import type { Seat } from './camera';

type Put = ReturnType<typeof frame>;

/** Jardim posicionado: centro, giro (+z local = para fora do lote) e quantas peças couberam. */
interface G {
  bd: ParkBuilding;
  cx: number;
  cz: number;
  rot: number;
  n: number;
  at: (lx: number, lz: number) => { x: number; z: number };
}

/** Peça aceita: ponto no mundo, chão no centro e quanto a base desce para cobrir o desnível (negativo). */
interface Placed {
  x: number;
  z: number;
  y: number;
  base: number;
}

/** Maior desnível aceito sob uma peça (metros). */
const MAX_STEP = 0.6;

/** Piso de cada área (um pouco mais claro que o dos caminhos dela). */
const PAVE: Record<ParkRegion, string> = {
  central: '#E7E1D3',
  knowledge: '#D8C2A8',
  planning: '#E3E6E9',
  growth: '#EBDDB8',
  activity: '#D9A88C',
  finance: '#B8BEC6',
};

function pick<T>(list: readonly T[], i: number): T {
  const n = list.length;
  return list[((Math.round(i) % n) + n) % n]!;
}

const faceTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);

/** `n` pontos num círculo de raio `r` (ângulo `a`, 0 = +z local). */
const ring = (n: number, r: number, off = 0) =>
  Array.from({ length: n }, (_, k) => {
    const a = off + (k / n) * Math.PI * 2;
    return { a, x: Math.sin(a) * r, z: Math.cos(a) * r };
  });

/** Chão mais baixo e mais alto sob uma peça (centro e seis pontos da borda). */
function spread(x: number, z: number, r: number): { lo: number; hi: number } {
  let lo = heightAt(x, z);
  let hi = lo;
  const rr = Math.max(0.3, r);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const h = heightAt(x + Math.sin(a) * rr, z + Math.cos(a) * rr);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return { lo, hi };
}

/**
 * Piso redondo (ou anel, com `inner`) que acompanha o relevo: cada vértice na altura do chão + `lift`.
 * Malha polar com poucos anéis (triângulos virados para cima).
 */
function groundDisc(x: number, z: number, r: number, inner: number, lift: number, segs: number, rings: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const hole = inner > 0;
  const vert = (rr: number, a: number) => {
    const wx = x + Math.sin(a) * rr;
    const wz = z + Math.cos(a) * rr;
    pos.push(wx, heightAt(wx, wz) + lift, wz);
  };
  if (!hole) vert(0, 0);
  const first = hole ? 0 : 1;
  for (let k = first; k <= rings; k++) {
    const rr = hole ? inner + ((r - inner) * k) / rings : (r * k) / rings;
    for (let s = 0; s < segs; s++) vert(rr, (s / segs) * Math.PI * 2);
  }
  const at = (k: number, s: number) => (hole ? 0 : 1) + (k - first) * segs + (s % segs);
  if (!hole) for (let s = 0; s < segs; s++) idx.push(0, at(1, s), at(1, s + 1));
  for (let k = first; k < rings; k++)
    for (let s = 0; s < segs; s++) {
      const a = at(k, s);
      const b = at(k, s + 1);
      const c = at(k + 1, s);
      const d = at(k + 1, s + 1);
      idx.push(a, c, d, a, d, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Piso quadrado (meio lado `h`, girado `rot`) que acompanha o relevo, em grade de `n` × `n`. */
function groundSquare(x: number, z: number, rot: number, h: number, lift: number, n: number): THREE.BufferGeometry {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const lx = -h + (2 * h * i) / n;
      const lz = -h + (2 * h * j) / n;
      const wx = x + lx * c + lz * s;
      const wz = z - lx * s + lz * c;
      pos.push(wx, heightAt(wx, wz) + lift, wz);
    }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const cc = a + n + 1;
      const d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function gardens(kit: Kit, free: (x: number, z: number, r: number) => boolean): { group: THREE.Group; spots: Array<{ x: number; z: number; r: number }>; seats: Seat[]; sites: Array<{ id: string; x: number; z: number; pieces: number }> } {
  const sites: Array<{ id: string; x: number; z: number; pieces: number }> = [];
  const b = new Builder();
  const spots: Array<{ x: number; z: number; r: number }> = [];
  const seats: Seat[] = [];
  /** Peças já postas (todas as áreas): nada se sobrepõe. */
  const taken: Array<{ x: number; z: number; r: number }> = [];
  const m = {
    wood: kit.mat('#A0714F', { rough: 0.75 }),
    woodDark: kit.mat('#7A5233', { rough: 0.8 }),
    steel: kit.mat('#334155', { metal: 0.6, rough: 0.35 }),
    steelLight: kit.mat('#B8BEC6', { metal: 0.85, rough: 0.25 }),
    stone: kit.mat('#D9D2C3', { rough: 0.8 }),
    stoneDark: kit.mat('#9A958B', { rough: 0.9 }),
    kerb: kit.mat('#B9B1A2', { rough: 0.9 }),
    concrete: kit.mat('#C9CED4', { rough: 0.7 }),
    granite: kit.mat('#4A5260', { rough: 0.45 }),
    dial: kit.mat('#ECE6D8', { rough: 0.5 }),
    soil: kit.mat('#5A4632', { rough: 1 }),
    hedge: kit.mat('#3E7B3A', { rough: 0.95 }),
    leaf: [kit.mat('#4C9A4F', { rough: 0.9 }), kit.mat('#3E7B3A', { rough: 0.9 }), kit.mat('#6BAA4F', { rough: 0.9 })],
    bloom: ['#F472B6', '#FBBF24', '#C084FC', '#F87171', '#FFFFFF', '#60A5FA'].map((c) => kit.mat(c, { rough: 0.8 })),
    water: kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }),
    brass: kit.mat('#C9A227', { metal: 0.8, rough: 0.3 }),
    terracotta: kit.mat('#C2654F', { rough: 0.85 }),
    canvas: kit.mat('#F4EFE6', { rough: 0.9, side: THREE.DoubleSide }),
  };
  const accent = (g: G, o: MatOpts = {}) => kit.mat(g.bd.color, { rough: 0.5, ...o });
  const pave = (g: G) => kit.mat(PAVE[g.bd.region], { rough: g.bd.region === 'finance' ? 0.55 : 0.85 });

  /**
   * Chão livre para uma peça de raio `r`: livre para o mundo (`free` e isFreeGround), a mais de 2 m da
   * borda de qualquer lote, fora do corredor da entrada do prédio, longe da margem rebaixada do lago,
   * dentro dos 32 m da ilha (Focus) e com desnível de no máximo MAX_STEP.
   */
  const fitsGround = (bd: ParkBuilding, x: number, z: number, r: number): boolean => {
    if (!free(x, z, r) || !isFreeGround(x, z, Math.min(r, 1.2))) return false;
    if (r > 1.2)
      for (let k = 0; k < 6; k++) {
        const t = (k / 6) * Math.PI * 2;
        const px = x + Math.sin(t) * r * 0.6;
        const pz = z + Math.cos(t) * r * 0.6;
        if (!free(px, pz, r * 0.45) || !isFreeGround(px, pz, r * 0.45)) return false;
      }
    if (PARK_BUILDINGS.some((o) => Math.hypot(x - o.x, z - o.z) < o.radius + 2 + r)) return false;
    const a = facingOf(bd);
    const fx = Math.sin(a);
    const fz = Math.cos(a);
    const rx = x - bd.x;
    const rz = z - bd.z;
    const f = rx * fx + rz * fz;
    if (f > 0 && f < bd.radius + 16 && Math.abs(rx * fz - rz * fx) < 4 + r) return false;
    if (bd.id === 'focus') {
      // Na ilha: até 32 m do centro (a profundidade dos bancos e pedras, deitados na tangente, é pequena).
      if (Math.hypot(rx, rz) + Math.min(r, 0.6) > 32) return false;
    } else if (inWater(x, z, 6 + r)) return false; // a margem do lago e dos lagos é rebaixada no desenho
    const s = spread(x, z, r);
    return s.hi - s.lo <= MAX_STEP;
  };
  const fits = (bd: ParkBuilding, x: number, z: number, r: number) => !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r) && fitsGround(bd, x, z, r);

  /** Tenta pôr uma peça de raio `r` no ponto local; `hold` é o raio que ela ocupa para as outras (0: nenhum). */
  const place = (g: G, lx: number, lz: number, r: number, hold = r): Placed | null => {
    const p = g.at(lx, lz);
    if (!fits(g.bd, p.x, p.z, r)) return null;
    const y = heightAt(p.x, p.z);
    const s = spread(p.x, p.z, r);
    if (hold > 0) taken.push({ x: p.x, z: p.z, r: hold });
    spots.push({ x: p.x, z: p.z, r: r + 0.3 });
    g.n++;
    return { x: p.x, z: p.z, y, base: Math.min(0, s.lo - y) - 0.08 };
  };
  /** Assento no ponto local (lx, lz) de uma peça girada `yaw`, olhando para `face`. */
  const sit = (p: Placed, yaw: number, lx: number, lz: number, face: number, h = 0.45) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    seats.push({ x: p.x + lx * c + lz * s, y: p.y + h, z: p.z - lx * s + lz * c, face });
  };
  /** Moita baixa facetada (folhagem ou flores). */
  const blob = (put: Put, mat: THREE.Material, lx: number, ly: number, lz: number, s: number) =>
    put(mat, new THREE.IcosahedronGeometry(s, 0), lx, ly, lz, 0, lx * 3.1 + lz * 1.7, 0, [1, 0.75, 1]);
  /** Caixa do chão (com a base descendo até o ponto mais baixo) até `top`. */
  const rise = (put: Put, p: Placed, mat: THREE.Material, w: number, d: number, top: number, lx = 0, lz = 0) =>
    put(mat, new THREE.BoxGeometry(w, top - p.base, d), lx, (top + p.base) / 2, lz);
  /** Referencial de uma peça aceita (no chão do centro dela, girada `yaw`). */
  const put1 = (p: Placed, yaw: number) => frame(b, p.x, p.y, p.z, yaw);

  /* ---------- Peças (coordenadas e giros locais do jardim) ---------- */

  /** Banco de 1,8 m (assento a 0,45 m) olhando para `face`: com encosto, bloco de pedra com tampo de madeira ou ripado sem encosto. */
  const bench = (g: G, lx: number, lz: number, face: number, style: 'back' | 'block' | 'slat' = 'back'): boolean => {
    const p = place(g, lx, lz, 0.95);
    if (!p) return false;
    const yaw = face + g.rot;
    const put = frame(b, p.x, p.y, p.z, yaw);
    if (style === 'block') {
      rise(put, p, m.stone, 1.7, 0.5, 0.43);
      put(m.wood, new THREE.BoxGeometry(1.8, 0.05, 0.52), 0, 0.455, 0);
    } else {
      put(m.wood, new THREE.BoxGeometry(1.8, 0.07, 0.48), 0, 0.445, 0);
      for (const s of [-1, 1]) rise(put, p, style === 'slat' ? m.stoneDark : m.steel, 0.08, 0.42, 0.41, s * 0.72);
      if (style === 'back') put(m.wood, new THREE.BoxGeometry(1.8, 0.42, 0.06), 0, 0.7, -0.24, -0.12);
    }
    sit(p, yaw, 0, 0, yaw);
    return true;
  };
  /** Banqueta redonda (tambor) olhando para `face`. */
  const stool = (g: G, lx: number, lz: number, face: number, mat: THREE.Material = m.wood): boolean => {
    const p = place(g, lx, lz, 0.26);
    if (!p) return false;
    const yaw = face + g.rot;
    put1(p, yaw)(mat, new THREE.CylinderGeometry(0.2, 0.18, 0.45 - p.base, 9), 0, (0.45 + p.base) / 2, 0);
    sit(p, yaw, 0, 0, yaw);
    return true;
  };
  /** Mesa redonda de pé central (com guarda-sol, se pedido). */
  const table = (g: G, lx: number, lz: number, r = 0.45, h = 0.74, parasol = false): boolean => {
    const p = place(g, lx, lz, r + 0.1);
    if (!p) return false;
    const put = put1(p, g.rot);
    put(m.wood, new THREE.CylinderGeometry(r, r, 0.04, 12), 0, h, 0);
    put(m.steel, new THREE.CylinderGeometry(0.04, 0.04, h - p.base, 6), 0, (h + p.base) / 2, 0);
    put(m.steel, new THREE.CylinderGeometry(0.2, 0.24, 0.04, 8), 0, 0.02, 0);
    if (parasol) {
      put(m.steelLight, new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), 0, h + 0.8, 0);
      put(m.canvas, new THREE.ConeGeometry(1.35, 0.45, 8, 1, true), 0, h + 1.65, 0);
    }
    return true;
  };
  /** Mesa comprida com dois bancos corridos (dois ou três lugares de cada lado). */
  const picnic = (g: G, lx: number, lz: number, face: number, len = 1.8): boolean => {
    const p = place(g, lx, lz, Math.hypot(len / 2 + 0.1, 1.0));
    if (!p) return false;
    const yaw = face + g.rot;
    const put = put1(p, yaw);
    const legX = len / 2 - 0.25;
    put(m.wood, new THREE.BoxGeometry(len, 0.05, 0.8), 0, 0.74, 0);
    const n = len >= 2.4 ? 3 : 2;
    for (const s of [-1, 1]) {
      rise(put, p, m.steel, 0.07, 0.6, 0.72, s * legX);
      put(m.wood, new THREE.BoxGeometry(len, 0.05, 0.3), 0, 0.45, s * 0.72);
      for (const t of [-1, 1]) rise(put, p, m.steel, 0.06, 0.24, 0.43, t * legX, s * 0.72);
      for (let k = 0; k < n; k++) sit(p, yaw, (k - (n - 1) / 2) * (len / n), s * 0.72, yaw + (s > 0 ? Math.PI : 0));
    }
    return true;
  };
  /** Mesinha de escrever com banqueta (quem senta olha para `face`, a mesa fica na frente). */
  const desk = (g: G, lx: number, lz: number, face: number): boolean => {
    const p = place(g, lx, lz, 0.75);
    if (!p) return false;
    const yaw = face + g.rot;
    const put = put1(p, yaw);
    put(m.wood, new THREE.BoxGeometry(0.9, 0.04, 0.55), 0, 0.74, 0.3);
    for (const s of [-1, 1]) rise(put, p, m.steel, 0.04, 0.5, 0.72, s * 0.42, 0.3);
    put(m.woodDark, new THREE.CylinderGeometry(0.19, 0.17, 0.45 - p.base, 8), 0, (0.45 + p.base) / 2, -0.3);
    sit(p, yaw, 0, -0.3, yaw);
    return true;
  };
  /** Floreira retangular com terra e mudas (folhagem, e flores alternadas se `bloom`). */
  const planter = (g: G, lx: number, lz: number, w: number, d: number, face: number, o: { h?: number; mat?: THREE.Material; bloom?: number } = {}): boolean => {
    const h = o.h ?? 0.5;
    const p = place(g, lx, lz, Math.hypot(w, d) / 2 + 0.05);
    if (!p) return false;
    const put = put1(p, face + g.rot);
    rise(put, p, o.mat ?? m.concrete, w, d, h);
    put(m.soil, new THREE.BoxGeometry(w - 0.12, 0.04, d - 0.12), 0, h - 0.04, 0);
    const L = Math.max(w, d);
    const n = Math.max(1, Math.round(L / 0.7));
    const sz = Math.min(0.32, Math.min(w, d) * 0.5);
    for (let k = 0; k < n; k++) {
      const t = -L / 2 + 0.1 + ((L - 0.2) / n) * (k + 0.5);
      const mat = o.bloom !== undefined && k % 2 === 1 ? pick(m.bloom, o.bloom + k) : pick(m.leaf, k);
      blob(put, mat, w >= d ? t : 0, h + sz * 0.5, w >= d ? 0 : t, sz);
    }
    return true;
  };
  /** Vaso redondo com folhagem e flores. */
  const pot = (g: G, lx: number, lz: number, r: number, h: number, bloom: number, mat: THREE.Material = m.terracotta): boolean => {
    const p = place(g, lx, lz, r + 0.05);
    if (!p) return false;
    const put = put1(p, g.rot);
    put(mat, new THREE.CylinderGeometry(r, r * 0.8, h - p.base, 10), 0, (h + p.base) / 2, 0);
    blob(put, pick(m.leaf, bloom), 0, h + r * 0.45, 0, r * 0.95);
    blob(put, pick(m.bloom, bloom), r * 0.3, h + r * 0.75, r * 0.15, r * 0.55);
    return true;
  };
  /** Canteiro redondo elevado com borda de pedra: arbusto no meio e flores em volta. */
  const bed = (g: G, lx: number, lz: number, r: number, bloom: number, h = 0.4): boolean => {
    const p = place(g, lx, lz, r + 0.05);
    if (!p) return false;
    const put = put1(p, g.rot);
    put(m.stone, new THREE.CylinderGeometry(r, r + 0.04, h - p.base, 12), 0, (h + p.base) / 2, 0);
    put(m.soil, new THREE.CircleGeometry(r - 0.08, 12), 0, h + 0.01, 0, -Math.PI / 2);
    blob(put, pick(m.leaf, bloom), 0, h + r * 0.35, 0, r * 0.5);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + bloom;
      blob(put, pick(m.bloom, bloom + (k % 2)), Math.sin(a) * r * 0.58, h + 0.12, Math.cos(a) * r * 0.58, Math.min(0.26, r * 0.3));
    }
    return true;
  };
  /** Sebe aparada (comprida no x local da peça). */
  const hedge = (g: G, lx: number, lz: number, len: number, face: number, h = 0.75, w = 0.55): boolean => {
    const p = place(g, lx, lz, Math.hypot(len, w) / 2);
    if (!p) return false;
    rise(put1(p, face + g.rot), p, m.hedge, len, w, h);
    return true;
  };
  /** Topiaria em cone num cachepô de granito. */
  const topiary = (g: G, lx: number, lz: number, r: number, h: number): boolean => {
    const p = place(g, lx, lz, r + 0.05);
    if (!p) return false;
    const put = put1(p, g.rot);
    rise(put, p, m.granite, r * 1.2, r * 1.2, 0.4);
    put(m.hedge, new THREE.ConeGeometry(r, h, 7), 0, 0.4 + h / 2, 0);
    return true;
  };
  /** Espelho d'água redondo: borda baixa de pedra e lâmina brilhante. */
  const roundPool = (g: G, lx: number, lz: number, r: number): boolean => {
    const p = place(g, lx, lz, r + 0.05);
    if (!p) return false;
    const put = put1(p, g.rot);
    const top = 0.28;
    put(m.stone, new THREE.CylinderGeometry(r, r, top - p.base, 18, 1, true), 0, (top + p.base) / 2, 0);
    put(m.stone, new THREE.RingGeometry(r - 0.22, r, 18), 0, top, 0, -Math.PI / 2);
    put(m.water, new THREE.CircleGeometry(r - 0.18, 18), 0, top - 0.06, 0, -Math.PI / 2);
    return true;
  };
  /** Espelho d'água retangular com borda de granito. */
  const pool = (g: G, lx: number, lz: number, w: number, d: number, face: number): boolean => {
    const p = place(g, lx, lz, Math.hypot(w, d) / 2 + 0.05);
    if (!p) return false;
    const put = put1(p, face + g.rot);
    const t = 0.25;
    for (const s of [-1, 1]) {
      rise(put, p, m.granite, w, t, 0.3, 0, (s * (d - t)) / 2);
      rise(put, p, m.granite, t, d - 2 * t, 0.3, (s * (w - t)) / 2, 0);
    }
    put(m.water, new THREE.PlaneGeometry(w - 2 * t + 0.02, d - 2 * t + 0.02), 0, 0.24, 0, -Math.PI / 2);
    return true;
  };
  /** Pérgola de madeira (só os pilares ocupam o chão: bancos e mesas ficam embaixo), com trepadeira se `vines`. */
  const pergola = (g: G, lx: number, lz: number, w: number, d: number, face: number, vines: boolean, h = 2.6): boolean => {
    const p = place(g, lx, lz, Math.hypot(w, d) / 2, 0);
    if (!p) return false;
    const yaw = face + g.rot;
    const put = put1(p, yaw);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const px = (sx * w) / 2;
        const pz = (sz * d) / 2;
        rise(put, p, m.woodDark, 0.16, 0.16, h, px, pz);
        taken.push({ x: p.x + px * c + pz * s, z: p.z - px * s + pz * c, r: 0.2 });
      }
    for (const sz of [-1, 1]) put(m.woodDark, new THREE.BoxGeometry(w + 0.4, 0.18, 0.12), 0, h + 0.09, (sz * d) / 2);
    const n = Math.max(3, Math.round(w / 0.5));
    for (let k = 0; k <= n; k++) put(m.wood, new THREE.BoxGeometry(0.08, 0.12, d + 0.5), -w / 2 + (k * w) / n, h + 0.24, 0);
    if (vines) for (let k = 0; k < 6; k++) blob(put, pick(m.leaf, k), -w / 2 + 0.4 + ((w - 0.8) * k) / 5, h + 0.42, ((k % 3) - 1) * d * 0.3, 0.45);
    return true;
  };
  /** Mastro discreto com flâmula lisa de uma cor (sem bandeira nem símbolo); todas apontam para o mesmo lado. */
  const pennant = (g: G, lx: number, lz: number, color: string, h = 3.2): boolean => {
    const p = place(g, lx, lz, 0.22);
    if (!p) return false;
    const put = put1(p, 0.6);
    rise(put, p, m.concrete, 0.34, 0.34, 0.18);
    put(m.steelLight, new THREE.CylinderGeometry(0.03, 0.04, h, 6), 0, h / 2, 0);
    put(m.steelLight, new THREE.SphereGeometry(0.05, 6, 4), 0, h + 0.03, 0);
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(0.85, -0.22);
    sh.lineTo(0, -0.44);
    sh.closePath();
    put(kit.mat(color, { rough: 0.7, side: THREE.DoubleSide }), new THREE.ShapeGeometry(sh), 0.03, h - 0.08, 0);
    return true;
  };
  /**
   * Relógio de sol: base, pedestal, mostrador com as marcas das horas e o gnômon alinhado norte–sul
   * (a aresta sobe para o sul, como no hemisfério sul).
   */
  const sundial = (g: G, lx: number, lz: number): boolean => {
    const p = place(g, lx, lz, 0.95);
    if (!p) return false;
    const put = put1(p, 0);
    put(m.stoneDark, new THREE.CylinderGeometry(0.85, 0.9, 0.22 - p.base, 10), 0, (0.22 + p.base) / 2, 0);
    put(m.stone, new THREE.CylinderGeometry(0.42, 0.5, 0.45, 8), 0, 0.445, 0);
    put(m.dial, new THREE.CylinderGeometry(0.62, 0.62, 0.05, 20), 0, 0.695, 0);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      put(m.brass, new THREE.BoxGeometry(0.035, 0.012, k % 3 === 0 ? 0.2 : 0.12), Math.sin(a) * 0.48, 0.726, Math.cos(a) * 0.48, 0, a, 0);
    }
    const blade = new THREE.Shape();
    blade.moveTo(-0.38, 0);
    blade.lineTo(0.3, 0);
    blade.lineTo(0.3, 0.36);
    blade.closePath();
    const gn = new THREE.ExtrudeGeometry(blade, { depth: 0.025, bevelEnabled: false });
    gn.translate(0, 0, -0.0125);
    // +x da lâmina (a ponta alta) para +z do mundo (sul).
    put(m.brass, gn, 0, 0.72, 0, 0, -Math.PI / 2);
    return true;
  };
  /** Obelisco escalonado: três degraus, coluna de quatro faces e ponta na cor do prédio. */
  const obelisk = (g: G, lx: number, lz: number, tip: THREE.Material): boolean => {
    const p = place(g, lx, lz, 1.3);
    if (!p) return false;
    const put = put1(p, g.rot);
    rise(put, p, m.stone, 1.8, 1.8, 0.25);
    put(m.stone, new THREE.BoxGeometry(1.3, 0.25, 1.3), 0, 0.375, 0);
    put(m.stoneDark, new THREE.BoxGeometry(0.85, 0.25, 0.85), 0, 0.625, 0);
    put(m.stone, new THREE.CylinderGeometry(0.2, 0.34, 3.4, 4), 0, 2.45, 0, 0, Math.PI / 4);
    put(tip, new THREE.ConeGeometry(0.24, 0.5, 4), 0, 4.4, 0, 0, Math.PI / 4);
    return true;
  };
  /** Tablado baixo para apresentações (frente para `face`), com degrau e friso de luz. */
  const stage = (g: G, lx: number, lz: number, face: number, w: number, d: number, strip: THREE.Material): boolean => {
    const p = place(g, lx, lz, Math.hypot(w / 2, d / 2 + 0.45));
    if (!p) return false;
    const put = put1(p, face + g.rot);
    rise(put, p, m.steel, w - 0.1, d - 0.1, 0.36);
    put(m.wood, new THREE.BoxGeometry(w, 0.06, d), 0, 0.39, 0);
    rise(put, p, m.stone, 1.4, 0.4, 0.2, 0, d / 2 + 0.2);
    put(strip, new THREE.BoxGeometry(w - 0.3, 0.04, 0.02), 0, 0.3, (d - 0.1) / 2 + 0.012);
    return true;
  };
  /** Barras de alongamento: três postes e barras em alturas diferentes. */
  const bars = (g: G, lx: number, lz: number, face: number, len: number): boolean => {
    const p = place(g, lx, lz, len / 2 + 0.1);
    if (!p) return false;
    const put = put1(p, face + g.rot);
    for (const t of [-1, 0, 1]) put(m.steel, new THREE.CylinderGeometry(0.045, 0.05, 1.3 - p.base, 6), (t * len) / 2, (1.3 + p.base) / 2, 0);
    put(m.steelLight, new THREE.CylinderGeometry(0.028, 0.028, len / 2, 6), -len / 4, 0.7, 0, 0, 0, Math.PI / 2);
    put(m.steelLight, new THREE.CylinderGeometry(0.028, 0.028, len / 2, 6), len / 4, 1.0, 0, 0, 0, Math.PI / 2);
    put(m.steelLight, new THREE.CylinderGeometry(0.028, 0.028, len, 6), 0, 1.25, 0, 0, 0, Math.PI / 2);
    return true;
  };
  /** Bebedouro de pedestal: coluna de concreto, cuba de inox com água e bica (decorativo). */
  const fountain = (g: G, lx: number, lz: number, face: number): boolean => {
    const p = place(g, lx, lz, 0.4);
    if (!p) return false;
    const put = put1(p, face + g.rot);
    rise(put, p, m.concrete, 0.34, 0.3, 0.86);
    put(m.steelLight, new THREE.CylinderGeometry(0.27, 0.17, 0.12, 12), 0, 0.92, 0.06);
    put(m.water, new THREE.CircleGeometry(0.22, 12), 0, 0.982, 0.06, -Math.PI / 2);
    put(m.steelLight, new THREE.CylinderGeometry(0.018, 0.018, 0.1, 5), 0, 1.03, -0.1);
    put(m.stoneDark, new THREE.BoxGeometry(0.5, 0.03, 0.5), 0, 0.015, 0);
    return true;
  };
  /** Bloco simples (degrau de alongar, base). */
  const block = (g: G, lx: number, lz: number, w: number, d: number, h: number, face: number, mat: THREE.Material): boolean => {
    const p = place(g, lx, lz, Math.hypot(w, d) / 2);
    if (!p) return false;
    rise(put1(p, face + g.rot), p, mat, w, d, h);
    return true;
  };
  /** Pisante: pedra redonda ou tábua de madeira deitada na direção `yaw`, rente ao chão. */
  const stepping = (g: G, lx: number, lz: number, yaw: number, mat: THREE.Material, wood: boolean): boolean => {
    const p = place(g, lx, lz, wood ? 0.42 : 0.36);
    if (!p) return false;
    const put = put1(p, yaw + g.rot);
    if (wood) put(mat, new THREE.BoxGeometry(0.8, 0.12, 0.3), 0, 0.02, 0);
    else put(mat, new THREE.CylinderGeometry(0.32, 0.35, 0.12, 7), 0, 0.02, 0);
    return true;
  };
  /** Moita baixa solta. */
  const shrub = (g: G, lx: number, lz: number, s: number, mat: THREE.Material): boolean => {
    const p = place(g, lx, lz, s);
    if (!p) return false;
    blob(put1(p, g.rot), mat, 0, s * 0.45, 0, s);
    return true;
  };

  /* ---------- Piso do jardim ---------- */

  /** Piso redondo com meio-fio, do maior raio que cabe (até 2,5 m); devolve o raio (0: sem piso). */
  const paveDisc = (g: G, R: number, mat: THREE.Material): number => {
    for (let r = R; r >= 2.5; r -= 0.5) {
      if (!fitsGround(g.bd, g.cx, g.cz, r)) continue;
      b.add(mat, groundDisc(g.cx, g.cz, r, 0, 0.06, 24, 3));
      b.add(m.kerb, groundDisc(g.cx, g.cz, r + 0.18, r - 0.08, 0.085, 24, 1));
      spots.push({ x: g.cx, z: g.cz, r: r + 0.6 });
      return r;
    }
    return 0;
  };
  /** Piso quadrado (meio lado até `H`) com faixa de borda, alinhado ao jardim. */
  const paveSquare = (g: G, H: number, mat: THREE.Material): number => {
    for (let h = H; h >= 2.5; h -= 0.5) {
      if (!fitsGround(g.bd, g.cx, g.cz, h * 1.42)) continue;
      b.add(m.kerb, groundSquare(g.cx, g.cz, g.rot, h + 0.2, 0.045, 4));
      b.add(mat, groundSquare(g.cx, g.cz, g.rot, h, 0.065, 6));
      spots.push({ x: g.cx, z: g.cz, r: h * 1.42 + 0.4 });
      return h;
    }
    return 0;
  };

  /* ---------- Onde fica cada jardim ---------- */

  const makeG = (bd: ParkBuilding, cx: number, cz: number, rot: number): G => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return { bd, cx, cz, rot, n: 0, at: (lx, lz) => ({ x: cx + lx * c + lz * s, z: cz - lx * s + lz * c }) };
  };
  const sites: Array<{ x: number; z: number; r: number }> = [];
  /**
   * Centro do jardim de raio `R`: candidatos logo fora do lote (a 2 m da borda), dos dois lados do
   * eixo da entrada e depois mais em volta; ganha o que tem mais chão livre, mais perto da entrada
   * e mais plano. O +z local aponta para fora do lote.
   */
  const site = (bd: ParkBuilding, R: number): G | null => {
    const a = facingOf(bd);
    let best: { x: number; z: number; score: number } | null = null;
    for (const da of [0.32, 0.45, 0.6, 0.75, 0.9, 1.1, 1.35, 1.65, 2.0, 2.4, 2.8])
      for (const side of [1, -1])
        for (const extra of [0.4, 1.8, 3.5]) {
          const ang = a + side * da;
          const d = bd.radius + 2 + R + extra;
          const x = bd.x + Math.sin(ang) * d;
          const z = bd.z + Math.cos(ang) * d;
          if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + R + 1)) continue;
          if (!fitsGround(bd, x, z, 1.2)) continue;
          let n = 0;
          for (let k = 0; k < 8; k++) {
            const t = (k / 8) * Math.PI * 2;
            if (fitsGround(bd, x + Math.sin(t) * R * 0.72, z + Math.cos(t) * R * 0.72, 0.9)) n++;
          }
          if (n < 6) continue;
          const sp = spread(x, z, R * 0.8);
          const score = n * 10 - da * 4 - extra * 1.5 - (sp.hi - sp.lo) * 8;
          if (!best || score > best.score) best = { x, z, score };
        }
    if (!best) return null;
    sites.push({ x: best.x, z: best.z, r: R });
    return makeG(bd, best.x, best.z, Math.atan2(best.x - bd.x, best.z - bd.z));
  };

  /* ---------- Temas (local: +z para fora do lote, -z para o prédio) ---------- */

  const LAYOUTS: Partial<Record<ModuleId, { R: number; build: (g: G) => void }>> = {
    // Pracinha com canteiros redondos, bancos e o relógio de sol no meio.
    calendar: {
      R: 5.5,
      build: (g) => {
        paveDisc(g, 5.2, pave(g));
        sundial(g, 0, 0);
        ring(4, 3.3, Math.PI / 4).forEach((p, k) => bed(g, p.x, p.z, 0.85, k));
        for (const p of ring(4, 3.6)) bench(g, p.x, p.z, p.a + Math.PI);
      },
    },
    // Jardim organizado: mesas em linha, floreiras alinhadas e bancos nas pontas.
    tasks: {
      R: 6.5,
      build: (g) => {
        paveSquare(g, 4.6, pave(g));
        bed(g, 0, 0, 0.7, 2);
        for (const s of [-1, 1]) {
          picnic(g, s * 2.2, 0, 0);
          planter(g, s * 2.2, 4.3, 1.6, 0.6, 0, { bloom: 2 });
          planter(g, s * 2.2, -4.3, 1.6, 0.6, 0, { bloom: 0, mat: accent(g) });
          bench(g, s * 4.6, 0, faceTo(s * 4.6, 0, 0, 0));
        }
      },
    },
    // Pátio colaborativo: duas mesas grandes e um canto de conversa em U.
    projects: {
      R: 6.5,
      build: (g) => {
        paveDisc(g, 6.2, pave(g));
        for (const s of [-1, 1]) picnic(g, s * 2.2, -1.5, 0, 2.6);
        table(g, 0, 3.6, 0.5);
        bench(g, -1.7, 3.6, Math.PI / 2, 'slat');
        bench(g, 1.7, 3.6, -Math.PI / 2, 'slat');
        bench(g, 0, 5.2, Math.PI, 'slat');
        for (const s of [-1, 1]) planter(g, s * 4.6, 2.0, 1.1, 1.1, 0, { bloom: 1, mat: accent(g) });
      },
    },
    // Praça de recepção: canteiro florido no meio, bancos de espera em volta e vasos de boas-vindas.
    inbox: {
      R: 5.5,
      build: (g) => {
        paveDisc(g, 5.2, pave(g));
        bed(g, 0, 0, 1.1, 4);
        for (const a of [0.65, -0.65, Math.PI - 0.65, Math.PI + 0.65]) bench(g, Math.sin(a) * 3, Math.cos(a) * 3, a + Math.PI);
        ring(4, 4.4).forEach((p, k) => pot(g, p.x, p.z, 0.45, 0.6, k, k % 2 ? accent(g) : m.terracotta));
      },
    },
    // Pátio acadêmico: bancos em roda sob a pérgola com trepadeira, mesinha no meio e floreiras.
    academy: {
      R: 6,
      build: (g) => {
        paveDisc(g, 5.7, pave(g));
        pergola(g, 0, 0, 5, 5, 0, true);
        table(g, 0, 0, 0.5, 0.45);
        for (const p of ring(4, 1.75)) bench(g, p.x, p.z, p.a + Math.PI);
        for (const s of [-1, 1]) planter(g, s * 4.3, 0, 0.7, 1.6, 0, { bloom: 2, h: 0.6 });
      },
    },
    // Praça internacional: mesinhas redondas com banquetas, floreiras variadas e flâmulas lisas.
    languages: {
      R: 6,
      build: (g) => {
        paveDisc(g, 5.7, pave(g));
        const cols = [g.bd.color, '#F59E0B', '#F43F5E'];
        ring(3, 2.4).forEach((t, k) => {
          if (table(g, t.x, t.z, 0.4))
            for (const d of [Math.PI / 2, -Math.PI / 2, 0]) {
              const a = t.a + d;
              stool(g, t.x + Math.sin(a) * 0.8, t.z + Math.cos(a) * 0.8, a + Math.PI, pick([accent(g), m.wood, m.terracotta], k));
            }
          const pa = t.a + Math.PI / 3;
          const px = Math.sin(pa) * 4;
          const pz = Math.cos(pa) * 4;
          if (k === 0) planter(g, px, pz, 1.0, 1.0, pa, { bloom: 3, mat: accent(g) });
          else if (k === 1) pot(g, px, pz, 0.5, 0.55, 1);
          else pot(g, px, pz, 0.38, 0.9, 5, m.concrete);
          pennant(g, Math.sin(t.a) * 4.9, Math.cos(t.a) * 4.9, pick(cols, k));
        });
      },
    },
    // Jardim de leitura: mesa à sombra da pérgola, mesa com guarda-sol, bancos e floreiras.
    library: {
      R: 6,
      build: (g) => {
        paveDisc(g, 5.7, pave(g));
        pergola(g, 0, -1.2, 4.2, 3.4, 0, true);
        picnic(g, 0, -1.2, 0);
        table(g, 0, 2.6, 0.45, 0.74, true);
        for (const s of [-1, 1]) {
          stool(g, s * 0.85, 2.6, s > 0 ? -Math.PI / 2 : Math.PI / 2);
          bench(g, s * 3.5, 2.0, faceTo(s * 3.5, 2.0, 0, 0.8));
          planter(g, s * 3.7, -1.4, 0.6, 1.6, 0, { bloom: 5 });
        }
      },
    },
    // Jardim criativo: mesinhas de escrever viradas para o gramado, bancos e flores.
    notes: {
      R: 5.5,
      build: (g) => {
        paveDisc(g, 5.2, pave(g));
        bed(g, 0, 0, 0.9, 1);
        for (const a of [-0.9, 0, 0.9]) desk(g, Math.sin(a) * 2.6, Math.cos(a) * 2.6, a);
        for (const a of [Math.PI - 0.9, Math.PI + 0.9]) bench(g, Math.sin(a) * 3.2, Math.cos(a) * 3.2, a + Math.PI);
        for (const s of [-1, 1]) pot(g, s * 4.2, 0, 0.45, 0.55, 1, accent(g));
      },
    },
    // Jardim botânico: canteiros elevados de madeira, trilha de pisantes e bancos nas pontas.
    habits: {
      R: 6.5,
      build: (g) => {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) planter(g, sx * 2.4, sz * 2.2, 2.2, 1.1, 0, { h: 0.55, mat: m.woodDark, bloom: sx + sz + 2 });
        for (let k = 0; k <= 8; k++) {
          const lz = -4 + k;
          stepping(g, 0.6 * Math.sin(lz * 0.6), lz, 0.3 * k, m.stone, false);
        }
        bench(g, 0, 5.4, Math.PI, 'slat');
        bench(g, 0, -5.4, 0, 'slat');
        for (const [x, z] of [[4.6, 0], [-4.6, 0], [4.2, 4.0], [-4.2, -4.0]] as const) shrub(g, x, z, 0.5, pick(m.leaf, x + z));
      },
    },
    // Praça geométrica: obelisco escalonado no meio, bancos de pedra em cruz e canteiros nos cantos.
    goals: {
      R: 6,
      build: (g) => {
        paveSquare(g, 4.2, pave(g));
        obelisk(g, 0, 0, accent(g, { metal: 0.6, rough: 0.3 }));
        for (const p of ring(4, 3.0)) bench(g, p.x, p.z, p.a + Math.PI, 'block');
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) planter(g, sx * 3.5, sz * 3.5, 1.3, 1.3, 0, { h: 0.45, mat: m.hedge, bloom: sx - sz + 2 });
      },
    },
    // Jardim de observação: sebes baixas em arco, canteiros em ordem e espelho d'água discreto.
    insights: {
      R: 6.5,
      build: (g) => {
        paveDisc(g, 6.0, pave(g));
        roundPool(g, 0, 0.4, 1.5);
        [Math.PI, Math.PI - 0.8, Math.PI + 0.8].forEach((a, k) => bed(g, Math.sin(a) * 3.2, Math.cos(a) * 3.2, 0.85, k + 2));
        for (let k = 0; k < 7; k++) {
          const a = Math.PI - 1.3 + (k + 0.5) * (2.6 / 7);
          hedge(g, Math.sin(a) * 5.3, Math.cos(a) * 5.3, 1.8, a, 0.7, 0.45);
        }
        for (const s of [-1, 1]) bench(g, s * 2.6, 2.4, faceTo(s * 2.6, 2.4, 0, 0.4));
      },
    },
    // Praça musical: tablado baixo para apresentações, duas fileiras de bancos e vasos.
    music: {
      R: 6,
      build: (g) => {
        paveDisc(g, 5.7, pave(g));
        stage(g, 0, -2.4, 0, 3.8, 2.2, accent(g, { glow: true }));
        for (const lz of [1.0, 3.0]) for (const s of [-1, 1]) bench(g, s * 1.1, lz, Math.PI);
        for (const s of [-1, 1]) pot(g, s * 4.2, -2.4, 0.5, 0.6, 0, accent(g));
      },
    },
    // Área de alongamento: piso emborrachado, barras, degrau, bancos e bebedouro.
    sports: {
      R: 6,
      build: (g) => {
        paveDisc(g, 5.7, kit.mat('#B5603F', { rough: 0.95 }));
        for (const s of [-1, 1]) bars(g, s * 1.6, -2.4, 0, 2.4);
        block(g, 0, 0.4, 1.2, 0.6, 0.22, 0, m.stone);
        for (const s of [-1, 1]) bench(g, s * 3.3, 2.2, faceTo(s * 3.3, 2.2, 0, 0), 'slat');
        fountain(g, 0, 3.8, Math.PI);
      },
    },
    // Praça reservada: piso de granito, espelho d'água, sebes geométricas, topiarias e bancos.
    finance: {
      R: 6.3,
      build: (g) => {
        paveSquare(g, 4.4, pave(g));
        pool(g, 0, -0.6, 3.0, 1.6, 0);
        hedge(g, 0, -3.9, 2.4, 0, 0.7);
        for (const s of [-1, 1]) {
          hedge(g, s * 3.4, -0.6, 1.8, Math.PI / 2, 0.7);
          bench(g, s * 1.5, 2.4, Math.PI, 'block');
          topiary(g, s * 3.4, 2.6, 0.4, 1.3);
        }
      },
    },
  };

  /**
   * Focus (ilha de 34 m): no anel entre a borda do lote (30 m) e 32 m do centro, dos dois lados da
   * chegada da ponte: trilha de pedras e tábuas, bancos de pedra e madeira olhando para a água e
   * moitas baixas.
   */
  const focusGarden = (bd: ParkBuilding) => {
    const g = makeG(bd, bd.x, bd.z, 0);
    const a = facingOf(bd);
    for (const side of [1, -1]) {
      for (const t of [0.75, 1.15]) {
        const ang = a + side * t;
        bench(g, Math.sin(ang) * 31, Math.cos(ang) * 31, ang, 'block');
      }
      let k = 0;
      for (let t = 0.55; t <= 1.3; t += 1.05 / 30.45) {
        const ang = a + side * t;
        const wood = k++ % 3 === 1;
        stepping(g, Math.sin(ang) * 30.45, Math.cos(ang) * 30.45, ang, wood ? m.wood : m.stoneDark, wood);
      }
      for (const t of [0.6, 0.95, 1.35])
        for (const dt of [-0.02, 0.02]) {
          const ang = a + side * (t + dt);
          shrub(g, Math.sin(ang) * 31.45, Math.cos(ang) * 31.45, 0.3, pick(m.leaf, t * 10 + dt * 100));
        }
    }
  };

  for (const bd of PARK_BUILDINGS) {
    if (bd.id === 'focus') {
      const before = spots.length;
      focusGarden(bd);
      sites.push({ id: bd.id, x: bd.x, z: bd.z, pieces: spots.length - before });
      continue;
    }
    const L = LAYOUTS[bd.id];
    if (!L) continue;
    const g = site(bd, L.R);
    if (!g) {
      sites.push({ id: bd.id, x: NaN, z: NaN, pieces: 0 });
      continue;
    }
    L.build(g);
    sites.push({ id: bd.id, x: g.cx, z: g.cz, pieces: g.n });
    if (g.n > 0) spots.push({ x: g.cx, z: g.cz, r: L.R + 0.5 });
  }
  return { group: b.build(), spots, seats, sites };
}

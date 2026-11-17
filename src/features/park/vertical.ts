/**
 * Desenho da circulação vertical (seções 30 a 32): a escada principal de cada prédio (degraus com
 * espelho, laje inclinada por baixo, longarinas, guarda-corpo de vidro com corrimão dos dois lados de
 * cada lance, patamares com guarda-corpo nas bordas livres e o guarda-corpo do vão em cada laje) e
 * os elevadores (núcleo fechado dentro do prédio, nos fundos, uma ou duas cabines lado a lado,
 * portas de correr na cabine e em cada pavimento, botoeira de chamada e indicador de pavimento
 * sobre cada porta, abrindo para o hall de cada nível). Tudo
 * numa geometria só por material (Builder); só as cabines, as portas e os indicadores se mexem.
 */
import * as THREE from 'three';
import { Builder, type Kit } from './kit';
import { slab } from './forms';
import type { Pt } from './outline';
import { LANE, contourEdges, phaseAt, type Stair } from './stairs';

/** Caixa reta entre dois pontos (x, y, z): `w` de largura (de lado) e `h` de altura, ao longo do segmento. */
export function beam(b: Builder, m: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, h: number): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const l = Math.hypot(dx, dz);
  const len = Math.hypot(l, dy);
  if (len < 1e-3) return;
  const g = new THREE.BoxGeometry(w, h, len);
  g.rotateX(-Math.atan2(dy, l));
  g.rotateY(Math.atan2(dx, dz));
  b.add(m, g, [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]);
}

/** Guarda-corpo de vidro (1,1 m) com corrimão entre dois pontos do piso na altura `y`. */
export function guard(b: Builder, glass: THREE.Material, metal: THREE.Material, a: Pt, c: Pt, y: number): void {
  beam(b, glass, a[0], y + 0.55, a[1], c[0], y + 0.55, c[1], 0.03, 0.95);
  beam(b, metal, a[0], y + 1.08, a[1], c[0], y + 1.08, c[1], 0.06, 0.05);
  b.add(metal, new THREE.BoxGeometry(0.05, 1.1, 0.05), [a[0], y + 0.55, a[1]]);
}

/**
 * A escada inteira, de nível em nível (o térreo alto em trechos com patamares). Em cada laje de cima,
 * o guarda-corpo em volta do vão (aberto só no patamar, por onde se entra na escada).
 */
export function drawStair(kit: Kit, b: Builder, st: Stair, warm: boolean): void {
  const tread = kit.mat(warm ? '#B08968' : '#C3C9D1', { rough: 0.7 });
  const body = kit.mat(warm ? '#E8E1D4' : '#E3E6EA', { rough: 0.85 });
  const riserMat = kit.mat(warm ? '#F2ECE2' : '#F1F3F5', { rough: 0.8 });
  const metal = kit.mat('#8D99A8', { metal: 0.85, rough: 0.3 });
  const steel = kit.mat('#3A4452', { metal: 0.5, rough: 0.5 });
  const glass = kit.mat('#CFE7F5', { glass: true, side: THREE.DoubleSide });
  const P = st.phases.length;

  const flight = (pts: readonly Pt[], ya: number, yb: number) => {
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]));
    const total = lens.reduce((s, l) => s + l, 0);
    if (total < 0.1) return;
    const n = Math.max(2, Math.round(total / 0.29));
    const rise = (yb - ya) / n;
    // Ponto e direção a `s` m do começo (no plano).
    const at = (s: number) => {
      let i = 0;
      while (i < lens.length - 1 && s > lens[i]!) s -= lens[i++]!;
      const a = pts[i]!;
      const c = pts[i + 1] ?? a;
      const l = lens[i] || 1;
      const t = Math.min(1, s / l);
      return { x: a[0] + (c[0] - a[0]) * t, z: a[1] + (c[1] - a[1]) * t, yaw: Math.atan2(c[0] - a[0], c[1] - a[1]) };
    };
    for (let i = 0; i < n; i++) {
      const top = ya + (i + 1) * rise;
      const p = at(((i + 0.5) / n) * total);
      b.add(tread, new THREE.BoxGeometry(LANE - 0.04, 0.05, total / n + 0.03), [p.x, top - 0.025, p.z], [0, p.yaw, 0]);
      const q = at((i / n) * total);
      b.add(riserMat, new THREE.BoxGeometry(LANE - 0.08, rise, 0.03), [q.x, top - rise / 2 - 0.03, q.z], [0, q.yaw, 0]);
    }
    let acc = 0;
    pts.slice(1).forEach((c, i) => {
      const a = pts[i]!;
      const l = lens[i]!;
      const ha = ya + (acc / total) * (yb - ya);
      const hc = ya + ((acc + l) / total) * (yb - ya);
      acc += l;
      if (l < 1e-3) return;
      // Laje inclinada por baixo dos degraus.
      beam(b, body, a[0], ha - 0.16, a[1], c[0], hc - 0.16, c[1], LANE, 0.22);
      const nx = (c[1] - a[1]) / l;
      const nz = -(c[0] - a[0]) / l;
      for (const s of [-1, 1]) {
        const ox = nx * s * (LANE / 2);
        const oz = nz * s * (LANE / 2);
        // Longarina, guarda-corpo de vidro e corrimão a 0,95 m da linha dos degraus.
        beam(b, steel, a[0] + ox, ha - 0.05, a[1] + oz, c[0] + ox, hc - 0.05, c[1] + oz, 0.06, 0.42);
        beam(b, glass, a[0] + ox, ha + 0.5, a[1] + oz, c[0] + ox, hc + 0.5, c[1] + oz, 0.025, 0.8);
        beam(b, metal, a[0] + ox, ha + 0.95, a[1] + oz, c[0] + ox, hc + 0.95, c[1] + oz, 0.05, 0.05);
      }
    });
    // Montantes do corrimão no começo e no fim do lance.
    const e0 = pts[0]!;
    const e1 = pts[pts.length - 1]!;
    for (const [e, y] of [[e0, ya], [e1, yb]] as const) {
      const d = at(e === e0 ? 0 : total);
      const nx = Math.cos(d.yaw);
      const nz = -Math.sin(d.yaw);
      for (const s of [-1, 1]) b.add(metal, new THREE.BoxGeometry(0.05, 1.0, 0.05), [e[0] + nx * s * (LANE / 2), y + 0.5, e[1] + nz * s * (LANE / 2)]);
    }
  };
  // Patamar solto (no meio da subida): laje e guarda-corpo nas bordas que dão para o vazio.
  const landing = (pts: readonly Pt[], y: number) => {
    b.add(body, slab([...pts], [], y, 0.22));
    for (const [a, c] of contourEdges(pts, st.well)) guard(b, glass, metal, a, c, y);
  };

  for (let L = 0; L + 1 < st.ys.length; L++) {
    const y0 = st.ys[L]!;
    const k = st.segs[L] ?? 1;
    const r = (st.ys[L + 1]! - y0) / k;
    for (let j = 0; j < k; j++) {
      const ph = st.phases[((st.first[L] ?? 0) + j) % P]!;
      const ys = y0 + j * r;
      for (const f of ph.flights) flight(f.pts, ys + f.h0 * r, ys + f.h1 * r);
      for (const m of ph.mids) landing(m, ys + 0.5 * r);
      if (j > 0) landing(ph.land, ys);
    }
  }
  for (let L = 1; L < st.ys.length; L++) for (const [a, c] of phaseAt(st, L).rails) guard(b, glass, metal, a, c, st.ys[L]!);
}

/** Um elevador: cabine (sobe e desce), portas da cabine e de cada pavimento, indicadores. */
export interface Lift {
  x: number;
  z: number;
  cabin: THREE.Group;
  /** Portas da cabine (filhas dela; x local). */
  doors: [THREE.Object3D, THREE.Object3D];
  /** Portas de cada pavimento (x no prédio). */
  hall: Array<[THREE.Object3D, THREE.Object3D]>;
  /** Luz do indicador de cada pavimento (x local = posição do andar da cabine). */
  marks: THREE.Object3D[];
  /** Meia largura da folha fechada e quanto ela corre para abrir. */
  shut: number;
  slide: number;
}

/** Posição (x local) da luz do indicador quando a cabine está no nível `n` de `count`. */
export const markX = (n: number, count: number): number => (n - (count - 1) / 2) * 0.13;

/**
 * Núcleo dos elevadores dentro do prédio, nos fundos (poço com centro em x = 0, z = `tz`; `w` × `d`
 * por dentro, paredes de `t` m), do chão até `topY`: paredes de concreto, em cada pavimento a frente
 * (para o hall) com uma porta de correr por cabine (folhas de 0,56 m), a botoeira de chamada
 * (sobe/desce) e, sobre cada porta, o indicador com uma luz por pavimento (acende a do andar onde a
 * cabine está) e o nome do pavimento; em cima, "Elevadores". Cabines de `cw` m de largura.
 */
export function buildLifts(
  kit: Kit,
  root: THREE.Object3D,
  b: Builder,
  o: { xs: readonly number[]; w: number; d: number; t: number; cw: number; tz: number; ys: readonly number[]; topY: number; accent: string; names: readonly string[]; title: string; sign: (label: string, color: string, w: number) => THREE.Object3D },
): Lift[] {
  const { xs, w, d, t, tz, ys, topY, accent } = o;
  const concrete = kit.mat('#D9D5CD', { rough: 0.85 });
  const steelDoor = kit.mat('#B8C0CA', { metal: 0.8, rough: 0.28 });
  const frame = kit.mat('#5B6573', { metal: 0.6, rough: 0.35 });
  const dark = kit.mat('#1F2733', { rough: 0.5 });
  const glow = kit.mat(accent, { glow: true });
  const dim = kit.mat('#475569', { rough: 0.6 });
  const lightMat = kit.mat('#FFF1D6', { glow: true });
  const cabWall = kit.mat('#E9EDF2', { rough: 0.4, metal: 0.2 });
  const floorMat = kit.mat('#9AA3AE', { rough: 0.6 });
  const front = tz + d / 2;
  // Face da frente do núcleo (para o hall): portas, batentes, botoeira e indicadores encostam nela.
  const fz = front + t;
  const half = 0.56;
  const doorH = 2.35;
  // Poço: fundo, laterais, divisória entre as cabines e a laje de cima.
  b.add(concrete, new THREE.BoxGeometry(w + 2 * t, topY, t), [0, topY / 2, tz - d / 2 - t / 2]);
  for (const s of [-1, 1]) b.add(concrete, new THREE.BoxGeometry(t, topY, d + 2 * t), [s * (w / 2 + t / 2), topY / 2, tz]);
  if (xs.length > 1) b.add(concrete, new THREE.BoxGeometry(0.12, topY, d), [0, topY / 2, tz]);
  b.add(concrete, new THREE.BoxGeometry(w + 2 * t + 0.1, 0.3, d + 2 * t + 0.1), [0, topY + 0.15, tz]);
  // Frente de cada pavimento: paredes entre as portas, vergas, batentes, botoeira, indicadores.
  const cuts = xs.map((x) => [x - half, x + half] as const);
  const lifts: Lift[] = xs.map((x): Lift => ({ x, z: tz, cabin: new THREE.Group(), doors: [new THREE.Object3D(), new THREE.Object3D()], hall: [], marks: [], shut: half / 2, slide: half - 0.04 }));
  const panelGeo = new THREE.BoxGeometry(half, doorH - 0.05, 0.04);
  ys.forEach((y, n) => {
    const yTop = n + 1 < ys.length ? ys[n + 1]! : topY;
    const band = yTop - y;
    let x0 = -w / 2 - t;
    for (const [a, c] of [...cuts, [w / 2 + t, w / 2 + t] as const]) {
      if (a - x0 > 0.01) b.add(concrete, new THREE.BoxGeometry(a - x0, band, t), [(x0 + a) / 2, y + band / 2, front + t / 2]);
      if (c - a > 0.01 && band > doorH) b.add(concrete, new THREE.BoxGeometry(c - a, band - doorH, t), [(a + c) / 2, y + doorH + (band - doorH) / 2, front + t / 2]);
      x0 = c;
    }
    lifts.forEach((lf, i) => {
      // Batente e soleira.
      for (const s of [-1, 1]) b.add(frame, new THREE.BoxGeometry(0.08, doorH, t + 0.06), [lf.x + s * (half + 0.04), y + doorH / 2, front + t / 2]);
      b.add(frame, new THREE.BoxGeometry(2 * half + 0.16, 0.08, t + 0.06), [lf.x, y + doorH + 0.04, front + t / 2]);
      b.add(frame, new THREE.BoxGeometry(2 * half, 0.02, t + 0.1), [lf.x, y + 0.01, front + t / 2]);
      // Folhas da porta do pavimento, no plano da parede: abrindo, correm para dentro dela.
      const pair = [-1, 1].map((s) => {
        const m = new THREE.Mesh(panelGeo, steelDoor);
        m.userData.noCollide = true;
        m.position.set(lf.x + s * lf.shut, y + doorH / 2, front + t / 2);
        root.add(m);
        return m;
      });
      lf.hall.push([pair[0]!, pair[1]!]);
      // Indicador de pavimento sobre a porta: uma luz apagada por nível e a acesa no andar da cabine.
      const g = new THREE.Group();
      g.position.set(lf.x, y + doorH + 0.32, fz + 0.04);
      b.add(dark, new THREE.BoxGeometry(Math.max(0.5, ys.length * 0.13 + 0.16), 0.2, 0.04), [lf.x, y + doorH + 0.32, fz + 0.02]);
      ys.forEach((_, k) => b.add(dim, new THREE.BoxGeometry(0.08, 0.05, 0.02), [lf.x + markX(k, ys.length), y + doorH + 0.32, fz + 0.045]));
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.02), glow);
      kit.own(mark.geometry);
      mark.position.x = markX(0, ys.length);
      mark.position.z = 0.03;
      g.add(mark);
      g.userData.noCollide = true;
      mark.userData.noCollide = true;
      root.add(g);
      lf.marks.push(mark);
      // Botoeira de chamada: entre as portas (duas cabines) ou à direita (uma).
      if (i === lifts.length - 1) {
        const bx = lifts.length > 1 ? 0 : lf.x + half + 0.3;
        b.add(dark, new THREE.BoxGeometry(0.16, 0.34, 0.04), [bx, y + 1.15, fz + 0.02]);
        if (n + 1 < ys.length) b.add(glow, new THREE.CircleGeometry(0.035, 12), [bx, y + 1.22, fz + 0.045]);
        if (n > 0) b.add(glow, new THREE.CircleGeometry(0.035, 12), [bx, y + 1.08, fz + 0.045]);
      }
    });
    // Nome do pavimento e "Elevadores" sobre as portas.
    const name = o.sign(o.names[n] ?? '', accent, 1.6);
    name.position.set(0, y + doorH + 0.75, fz + 0.04);
    root.add(name);
    if (band > doorH + 1.6) {
      const tt = o.sign(o.title, accent, 2.2);
      tt.position.set(0, y + doorH + 1.3, fz + 0.04);
      root.add(tt);
    }
  });
  kit.own(panelGeo);
  // Cabines: piso, fundo e laterais, teto com luz, corrimão, painel de andares e as portas de correr.
  const cw = o.cw;
  const cd = d - 0.5;
  for (const lf of lifts) {
    const cb = new Builder();
    cb.add(floorMat, new THREE.BoxGeometry(cw, 0.12, cd), [0, -0.06, 0]);
    cb.add(cabWall, new THREE.BoxGeometry(cw, 2.4, 0.06), [0, 1.2, -cd / 2]);
    for (const s of [-1, 1]) cb.add(cabWall, new THREE.BoxGeometry(0.06, 2.4, cd), [s * cw / 2, 1.2, 0]);
    for (const s of [-1, 1]) cb.add(cabWall, new THREE.BoxGeometry(cw / 2 - half, 2.4, 0.06), [s * (half + (cw / 2 - half) / 2), 1.2, cd / 2]);
    cb.add(cabWall, new THREE.BoxGeometry(cw, 0.1, cd), [0, 2.45, 0]);
    cb.add(lightMat, new THREE.BoxGeometry(cw * 0.6, 0.02, cd * 0.6), [0, 2.39, 0]);
    cb.add(frame, new THREE.BoxGeometry(cw - 0.3, 0.04, 0.04), [0, 0.92, -cd / 2 + 0.08]);
    cb.add(dark, new THREE.BoxGeometry(0.04, 0.5, 0.24), [cw / 2 - 0.05, 1.3, cd / 2 - 0.4]);
    for (let k = 0; k < ys.length; k++) cb.add(glow, new THREE.CircleGeometry(0.03, 10), [cw / 2 - 0.075, 1.12 + k * 0.09, cd / 2 - 0.4], [0, -Math.PI / 2, 0]);
    lf.cabin.add(cb.build());
    lf.doors.forEach((dr, k) => {
      const s = k === 0 ? -1 : 1;
      dr.add(new THREE.Mesh(panelGeo, steelDoor));
      dr.position.set(s * lf.shut, doorH / 2, cd / 2 + 0.05);
      lf.cabin.add(dr);
    });
    lf.cabin.position.set(lf.x, ys[0] ?? 0, tz);
    lf.cabin.traverse((ob) => (ob.userData.noCollide = true));
    root.add(lf.cabin);
  }
  return lifts;
}

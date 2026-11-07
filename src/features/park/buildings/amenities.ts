/**
 * Espaços de convivência (V2.1, seção 9) e residências fora da área explorável (13.8).
 * Tudo juntado por material: dezenas de peças em poucos desenhos por quadro.
 * Bancos e mirantes viram pontos de interação (sentar, observar).
 */
import * as THREE from 'three';
import { POIS, heightAt, residences, seededRandom, type Poi } from '@/domain/park';
import { Builder, type Kit } from '../kit';

export interface Seat {
  x: number;
  y: number;
  z: number;
  /** Para onde a pessoa sentada olha (ângulo em y; 0 = +z). */
  face: number;
}

export interface Viewpoint {
  x: number;
  y: number;
  z: number;
  view: number;
}

export interface Amenities {
  group: THREE.Group;
  seats: Seat[];
  viewpoints: Viewpoint[];
  /** Mesas de café e pontos onde as pessoas param (para as rotinas). */
  spots: Array<{ id: string; x: number; z: number; kind: Poi['kind'] }>;
}

export function amenities(kit: Kit): Amenities {
  const b = new Builder();
  const wood = kit.mat('#A0714F', { rough: 0.75 });
  const dark = kit.mat('#334155', { metal: 0.6, rough: 0.35 });
  const stone = kit.mat('#E2DCCD', { rough: 0.85 });
  const canvas = kit.mat('#F4EFE6', { rough: 0.9, side: THREE.DoubleSide });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const warm = kit.mat('#FFE7B0', { glow: true });
  const seats: Seat[] = [];
  const viewpoints: Viewpoint[] = [];
  const spots: Amenities['spots'] = [];

  /** Banco de 0,45 m de assento (escala da V2.1), virado para `face`. */
  const bench = (x: number, z: number, face: number) => {
    const y = heightAt(x, z);
    const back = face + Math.PI;
    b.add(wood, new THREE.BoxGeometry(1.8, 0.08, 0.5), [x, y + 0.45, z], [0, face, 0]);
    b.add(wood, new THREE.BoxGeometry(1.8, 0.45, 0.07), [x + Math.sin(back) * 0.26, y + 0.72, z + Math.cos(back) * 0.26], [-0.12, face, 0]);
    for (const s of [-1, 1]) b.add(dark, new THREE.BoxGeometry(0.07, 0.45, 0.45), [x + Math.cos(face) * s * 0.8, y + 0.22, z - Math.sin(face) * s * 0.8], [0, face, 0]);
    seats.push({ x, y: y + 0.45, z, face });
  };
  /** Mesa de 0,75 m com dois bancos. */
  const table = (x: number, z: number, rot: number, umbrella: boolean) => {
    const y = heightAt(x, z);
    b.add(wood, new THREE.CylinderGeometry(0.55, 0.55, 0.05, 20), [x, y + 0.75, z]);
    b.add(dark, new THREE.CylinderGeometry(0.05, 0.08, 0.75, 8), [x, y + 0.37, z]);
    for (const s of [-1, 1]) {
      const sx = x + Math.sin(rot) * s * 1;
      const sz = z + Math.cos(rot) * s * 1;
      b.add(wood, new THREE.BoxGeometry(0.4, 0.05, 0.4), [sx, y + 0.45, sz]);
      b.add(dark, new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), [sx, y + 0.22, sz]);
      seats.push({ x: sx, y: y + 0.45, z: sz, face: rot + (s > 0 ? Math.PI : 0) });
    }
    if (umbrella) {
      b.add(dark, new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), [x, y + 1.2, z]);
      b.add(canvas, new THREE.ConeGeometry(1.4, 0.5, 8, 1, true), [x, y + 2.5, z]);
    }
  };

  for (const p of POIS) {
    const y = heightAt(p.x, p.z);
    spots.push({ id: p.id, x: p.x, z: p.z, kind: p.kind });
    switch (p.kind) {
      case 'cafe': {
        // Quiosque do café com toldo, balcão e mesas com guarda-sol.
        b.add(stone, new THREE.CylinderGeometry(9, 9, 0.12, 40), [p.x, y + 0.06, p.z]);
        b.add(wood, new THREE.BoxGeometry(3.6, 2.6, 2.4), [p.x, y + 1.3, p.z - 3]);
        b.add(kit.mat('#14B8A6', { rough: 0.6, side: THREE.DoubleSide }), new THREE.BoxGeometry(4.4, 0.08, 1.6), [p.x, y + 2.6, p.z - 1.3], [0.25, 0, 0]);
        b.add(warm, new THREE.BoxGeometry(3, 0.6, 0.05), [p.x, y + 1.9, p.z - 1.78]);
        for (let i = 0; i < 4; i++) table(p.x - 4.5 + i * 3, p.z + 2.5 + (i % 2) * 1.6, i * 0.4, true);
        break;
      }
      case 'kiosk': {
        b.add(wood, new THREE.CylinderGeometry(1.6, 1.6, 2.4, 6), [p.x, y + 1.2, p.z]);
        b.add(kit.mat('#F97316', { rough: 0.5 }), new THREE.ConeGeometry(2.2, 1, 6), [p.x, y + 2.9, p.z]);
        b.add(warm, new THREE.BoxGeometry(1.4, 0.5, 0.05), [p.x, y + 1.6, p.z + 1.4]);
        for (let i = 0; i < 2; i++) table(p.x - 2.5 + i * 5, p.z + 4, 0, false);
        break;
      }
      case 'pergola':
      case 'reading': {
        // Pérgola de madeira com trepadeira e bancos (leitura e contemplação).
        for (const sx of [-3, 3]) for (const sz of [-2, 2]) b.add(wood, new THREE.BoxGeometry(0.22, 2.6, 0.22), [p.x + sx, y + 1.3, p.z + sz]);
        for (let i = 0; i < 9; i++) b.add(wood, new THREE.BoxGeometry(0.12, 0.16, 4.6), [p.x - 3.2 + i * 0.8, y + 2.68, p.z]);
        for (let i = 0; i < 8; i++) b.add(leaf, new THREE.IcosahedronGeometry(0.5 + (i % 3) * 0.15, 1), [p.x - 3 + i * 0.85, y + 2.9, p.z + Math.sin(i) * 1.4]);
        bench(p.x - 1.2, p.z + 1.2, Math.PI);
        bench(p.x + 1.2, p.z - 1.2, 0);
        break;
      }
      case 'viewpoint': {
        // Mirante: deque elevado com guarda-corpo (1 m), banco e a vista para `view`.
        const dx = Math.sin(p.view);
        const dz = Math.cos(p.view);
        b.add(wood, new THREE.BoxGeometry(7, 0.25, 5), [p.x, y + 0.6, p.z], [0, p.view, 0]);
        for (const s of [-1, 1]) b.add(dark, new THREE.BoxGeometry(0.1, 1.2, 0.1), [p.x + dx * 2.4 + Math.cos(p.view) * s * 3.3, y + 1.2, p.z + dz * 2.4 - Math.sin(p.view) * s * 3.3]);
        b.add(dark, new THREE.BoxGeometry(7, 0.08, 0.08), [p.x + dx * 2.4, y + 1.75, p.z + dz * 2.4], [0, p.view, 0]);
        b.add(dark, new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), [p.x - dx * 1, y + 1.3, p.z - dz * 1]);
        bench(p.x - dx * 1.6, p.z - dz * 1.6, p.view);
        viewpoints.push({ x: p.x, y: y + 0.75, z: p.z, view: p.view });
        break;
      }
      case 'plaza': {
        b.add(stone, new THREE.CylinderGeometry(8, 8, 0.1, 40), [p.x, y + 0.05, p.z]);
        b.add(stone, new THREE.CylinderGeometry(1.6, 1.8, 0.6, 24), [p.x, y + 0.3, p.z]);
        b.add(kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }), new THREE.CircleGeometry(1.45, 24), [p.x, y + 0.61, p.z], [-Math.PI / 2, 0, 0]);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          bench(p.x + Math.sin(a) * 5.5, p.z + Math.cos(a) * 5.5, a + Math.PI);
        }
        break;
      }
      case 'stage': {
        // Palco ao ar livre do anfiteatro do Pavilhão Musical.
        b.add(wood, new THREE.CylinderGeometry(5, 5.2, 0.8, 32, 1, false, -Math.PI / 2, Math.PI), [p.x, y + 0.4, p.z], [0, p.view, 0]);
        for (let k = 0; k < 4; k++) {
          const r = 8 + k * 1.4;
          b.add(stone, new THREE.CylinderGeometry(r + 1.2, r + 1.2, 0.4 + k * 0.4, 32, 1, false, Math.PI / 2 - 0.9, 1.8), [p.x, y + (0.4 + k * 0.4) / 2, p.z], [0, p.view, 0]);
        }
        break;
      }
    }
  }

  // Bancos ao longo dos caminhos centrais e perto do lago.
  for (const [x, z, f] of [[-30, -40, 0.6], [30, -40, -0.6], [-80, 60, 2.4], [-60, 75, 2.6], [-150, 60, -2.4], [0, -100, 0], [80, 0, Math.PI / 2], [-20, 130, Math.PI]] as const) bench(x, z, f);

  return { group: b.build(), seats, viewpoints, spots };
}

/** Residências: casas variadas de 1 ou 2 pavimentos, com jardim e luz nas janelas à noite. */
export function houses(kit: Kit): THREE.Group {
  const b = new Builder();
  const plaster = [kit.mat('#F1ECE2', { rough: 0.85 }), kit.mat('#E9D9BF', { rough: 0.85 }), kit.mat('#DCE6EE', { rough: 0.85 }), kit.mat('#EFE3D7', { rough: 0.85 }), kit.mat('#E3E8DD', { rough: 0.85 })];
  const tile = [kit.mat('#8A4B32', { rough: 0.7 }), kit.mat('#9C5A3C', { rough: 0.7 }), kit.mat('#5B4B44', { rough: 0.65 })];
  const slate = kit.mat('#3F4650', { rough: 0.6 });
  const cladding = kit.mat('#9B6B47', { rough: 0.7 });
  const frame = kit.mat('#2F3338', { rough: 0.5, metal: 0.3 });
  const whiteTrim = kit.mat('#FAFAF7', { rough: 0.6 });
  const win = kit.mat('#FFE2A8', { glow: true, rough: 0.4 });
  const doorMat = kit.mat('#6B4A33', { rough: 0.6 });
  const stone = kit.mat('#B9B3A8', { rough: 0.95 });
  const drive = kit.mat('#A7A39B', { rough: 0.95 });
  const lawn = kit.mat('#79B35E', { rough: 1 });
  const hedge = kit.mat('#3F7F44', { rough: 0.95 });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const pool = kit.mat('#4FB3E0', { rough: 0.15, metal: 0.1 });
  const deck = kit.mat('#A47551', { rough: 0.75 });
  const lamp = kit.mat('#FFE7B0', { glow: true });
  const glassRail = kit.mat('#CFE7F5', { glass: true });
  const rnd = seededRandom(77);
  for (const h of residences()) {
    const style = h.style;
    const cx = h.x;
    const cz = h.z;
    const cs = Math.cos(h.rot);
    const sn = Math.sin(h.rot);
    // Casa assentada numa base nivelada (o terreno de fora � ondulado).
    let y = Infinity;
    for (const [px, pz] of [[-8, -7], [8, -7], [-8, 9], [8, 9]] as const) y = Math.min(y, heightAt(cx + px * cs + pz * sn, cz - px * sn + pz * cs));
    const put = (m: THREE.Material, g: THREE.BufferGeometry, lx: number, ly: number, lz: number, ry = 0, sc?: [number, number, number]) => b.add(m, g, [cx + lx * cs + lz * sn, y + ly, cz - lx * sn + lz * cs], [0, h.rot + ry, 0], sc);
    const w = style === 1 ? 12 + rnd() * 2 : 10 + rnd() * 2.5;
    const d = 8.5 + rnd() * 2;
    const floors = style === 2 ? 1 : h.floors === 2 || style === 3 ? 2 : 1;
    const fh = 3;
    const wall = plaster[Math.floor(rnd() * plaster.length)]!;
    // Lote: base, gramado, entrada de carro e cerca viva.
    put(stone, new THREE.BoxGeometry(w + 6, 1.6, d + 9), 0, -0.8, 1.5);
    put(lawn, new THREE.BoxGeometry(w + 5.6, 0.05, d + 8.6), 0, 0.02, 1.5);
    put(drive, new THREE.BoxGeometry(3, 0.06, 5.5), w / 2 - 1, 0.05, d / 2 + 3);
    for (const s of [-1, 1]) put(hedge, new THREE.BoxGeometry(0.7, 0.9, d + 8), s * (w / 2 + 2.6), 0.45, 1.5);
    put(hedge, new THREE.BoxGeometry(w + 2, 0.9, 0.7), -1.6, 0.45, d / 2 + 5.6);
    // Caixa de correio e poste de luz do port�o.
    put(frame, new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), w / 2 + 1.8, 0.55, d / 2 + 5.4);
    put(doorMat, new THREE.BoxGeometry(0.3, 0.22, 0.45), w / 2 + 1.8, 1.15, d / 2 + 5.4);
    put(frame, new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6), -w / 2 - 1.8, 1.2, d / 2 + 5.4);
    put(lamp, new THREE.SphereGeometry(0.16, 10, 8), -w / 2 - 1.8, 2.5, d / 2 + 5.4);
    const H = floors * fh;
    if (style === 1) {
      // Moderna: dois volumes deslocados, laje plana, revestimento de madeira e grandes vidros.
      put(wall, new THREE.BoxGeometry(w * 0.6, fh, d), -w * 0.2, fh / 2, 0);
      put(cladding, new THREE.BoxGeometry(w * 0.45, fh, d * 0.85), w * 0.28, fh / 2, -d * 0.05);
      if (floors === 2) put(wall, new THREE.BoxGeometry(w * 0.7, fh, d * 0.9), w * 0.1, fh * 1.5, -0.4);
      put(slate, new THREE.BoxGeometry(w * 0.75, 0.25, d + 0.6), w * 0.1, H + 0.12, -0.2);
      put(frame, new THREE.BoxGeometry(w * 0.5, 2.3, 0.08), -w * 0.18, 1.3, d / 2 + 0.02);
      put(win, new THREE.BoxGeometry(w * 0.48, 2.2, 0.04), -w * 0.18, 1.3, d / 2 + 0.05);
      if (floors === 2) {
        put(win, new THREE.BoxGeometry(w * 0.5, 1.4, 0.04), w * 0.1, fh + 1.6, d * 0.45 - 0.35);
        put(whiteTrim, new THREE.BoxGeometry(w * 0.55, 0.12, 1.6), w * 0.1, fh + 0.05, d / 2 + 0.4);
        put(glassRail, new THREE.BoxGeometry(w * 0.55, 1.0, 0.04), w * 0.1, fh + 0.6, d / 2 + 1.2);
      }
      put(doorMat, new THREE.BoxGeometry(1.1, 2.3, 0.08), w * 0.3, 1.15, d * 0.43);
    } else {
      put(wall, new THREE.BoxGeometry(w, H, d), 0, H / 2, 0);
      // Rodap� de pedra e friso entre andares.
      put(stone, new THREE.BoxGeometry(w + 0.1, 0.5, d + 0.1), 0, 0.25, 0);
      if (floors === 2) put(whiteTrim, new THREE.BoxGeometry(w + 0.12, 0.14, d + 0.12), 0, fh, 0);
      // Janelas com moldura (frente e laterais) e porta com batente.
      for (let f = 0; f < floors; f++)
        for (const s of [-1, 1]) {
          const lx = s * w * 0.3;
          put(whiteTrim, new THREE.BoxGeometry(1.5, 1.5, 0.12), lx, f * fh + 1.6, d / 2 + 0.02);
          put(win, new THREE.BoxGeometry(1.3, 1.3, 0.06), lx, f * fh + 1.6, d / 2 + 0.06);
          put(frame, new THREE.BoxGeometry(0.05, 1.3, 0.08), lx, f * fh + 1.6, d / 2 + 0.08);
          put(whiteTrim, new THREE.BoxGeometry(0.12, 1.3, 1.3), s * (w / 2 + 0.02), f * fh + 1.6, 0);
          put(win, new THREE.BoxGeometry(0.06, 1.1, 1.1), s * (w / 2 + 0.05), f * fh + 1.6, 0);
        }
      put(whiteTrim, new THREE.BoxGeometry(1.4, 2.5, 0.14), 0, 1.25, d / 2 + 0.02);
      put(doorMat, new THREE.BoxGeometry(1.1, 2.25, 0.08), 0, 1.12, d / 2 + 0.07);
      put(lamp, new THREE.BoxGeometry(0.15, 0.25, 0.1), 0.9, 2.2, d / 2 + 0.1);
      const roofM = tile[style % tile.length]!;
      if (style === 0) {
        // Colonial: telhado de duas �guas, chamin� e varanda com colunas.
        const sh = new THREE.Shape([new THREE.Vector2(-(w / 2 + 0.6), 0), new THREE.Vector2(w / 2 + 0.6, 0), new THREE.Vector2(0, 2.6)]);
        const g = new THREE.ExtrudeGeometry(sh, { depth: d + 1, bevelEnabled: false });
        g.translate(0, 0, -(d + 1) / 2);
        put(roofM, g, 0, H, 0);
        put(stone, new THREE.BoxGeometry(0.8, 2.6, 0.8), w * 0.3, H + 1.3, -d * 0.2);
        put(deck, new THREE.BoxGeometry(w * 0.7, 0.2, 2.2), 0, 0.1, d / 2 + 1.1);
        for (const s of [-1, -0.33, 0.33, 1]) put(whiteTrim, new THREE.CylinderGeometry(0.12, 0.14, 2.7, 10), s * w * 0.33, 1.45, d / 2 + 2);
        put(roofM, new THREE.BoxGeometry(w * 0.74, 0.18, 2.6), 0, 2.85, d / 2 + 1.2);
      } else if (style === 2) {
        // Bangal�: quatro �guas, varanda de madeira e garagem.
        put(roofM, new THREE.CylinderGeometry(0.4, Math.max(w, d) * 0.72, 2.2, 4, 1), 0, H + 1.1, 0, Math.PI / 4, [w / Math.max(w, d), 1, d / Math.max(w, d)]);
        put(deck, new THREE.BoxGeometry(w + 1, 0.2, 2.6), 0, 0.1, d / 2 + 1.3);
        for (const s of [-1, 0, 1]) put(deck, new THREE.BoxGeometry(0.16, 2.6, 0.16), s * (w / 2), 1.4, d / 2 + 2.5);
        put(roofM, new THREE.BoxGeometry(w + 1.2, 0.15, 2.8), 0, 2.75, d / 2 + 1.3);
        put(wall, new THREE.BoxGeometry(3.6, 2.8, 6), w / 2 + 1.8, 1.4, 0.5);
        put(frame, new THREE.BoxGeometry(2.8, 2.3, 0.08), w / 2 + 1.8, 1.15, 3.52);
        put(slate, new THREE.BoxGeometry(4, 0.2, 6.4), w / 2 + 1.8, 2.9, 0.5);
      } else {
        // Sobrado tropical: telhado de uma �gua, p�rgola e piscina.
        const g = new THREE.BoxGeometry(w + 1.2, 0.25, d + 1.2);
        g.rotateX(0.12);
        put(roofM, g, 0, H + 0.6, 0);
        for (let k = 0; k < 7; k++) put(deck, new THREE.BoxGeometry(0.12, 0.18, 3.4), -w / 2 + 1 + k * 0.7, 2.9, d / 2 + 1.7);
        for (const s of [0, 1]) put(deck, new THREE.BoxGeometry(0.15, 2.9, 0.15), -w / 2 + 1 + s * 4.2, 1.45, d / 2 + 3.3);
        put(stone, new THREE.BoxGeometry(5.2, 0.12, 3.2), w / 2 - 2.8, 0.06, d / 2 + 3.6);
        put(pool, new THREE.BoxGeometry(4.6, 0.04, 2.6), w / 2 - 2.8, 0.14, d / 2 + 3.6);
      }
    }
    // �rvore e arbustos do jardim.
    const tx = (rnd() > 0.5 ? 1 : -1) * (w / 2 + 1);
    put(doorMat, new THREE.CylinderGeometry(0.15, 0.22, 2.8, 8), tx, 1.4, d / 2 + 4);
    put(leaf, new THREE.IcosahedronGeometry(1.7, 1), tx, 3.6, d / 2 + 4, 0, [1, 0.85, 1]);
    for (let k = 0; k < 4; k++) put(hedge, new THREE.IcosahedronGeometry(0.5 + rnd() * 0.3, 1), -w / 2 + 1 + k * (w / 3.2), 0.45, d / 2 + 0.8);
  }
  return b.build();
}

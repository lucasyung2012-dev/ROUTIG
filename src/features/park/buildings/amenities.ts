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
  const walls = [kit.mat('#F1ECE2', { rough: 0.8 }), kit.mat('#E5D3B8', { rough: 0.8 }), kit.mat('#DCE6EE', { rough: 0.8 }), kit.mat('#EBDDD2', { rough: 0.8 })];
  const roofs = [kit.mat('#7C4A32', { rough: 0.7 }), kit.mat('#4B5563', { rough: 0.6 }), kit.mat('#9A5B3B', { rough: 0.7 }), kit.mat('#374151', { rough: 0.6 })];
  const glass = kit.mat('#FFE2A8', { glow: true, rough: 0.6 });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const rnd = seededRandom(77);
  for (const h of residences()) {
    const y = heightAt(h.x, h.z);
    const w = 7 + rnd() * 3;
    const d = 6 + rnd() * 2;
    const hh = h.floors === 2 ? 6 : 3.2;
    b.add(walls[h.style]!, new THREE.BoxGeometry(w, hh, d), [h.x, y + hh / 2, h.z], [0, h.rot, 0]);
    if (h.style % 2) b.add(roofs[h.style]!, new THREE.BoxGeometry(w + 0.6, 0.3, d + 0.6), [h.x, y + hh + 0.15, h.z], [0, h.rot, 0]);
    else b.add(roofs[h.style]!, new THREE.CylinderGeometry(0, d * 0.62, 2, 4, 1), [h.x, y + hh + 1, h.z], [0, h.rot + Math.PI / 4, 0], [w / d, 1, 1]);
    // Janelas (acendem à noite) e porta.
    for (let f = 0; f < h.floors; f++) for (const s of [-1, 1]) b.add(glass, new THREE.BoxGeometry(1.1, 1, 0.1), [h.x + Math.cos(h.rot) * s * w * 0.25 + Math.sin(h.rot) * (d / 2 + 0.02), y + 1.6 + f * 2.8, h.z - Math.sin(h.rot) * s * w * 0.25 + Math.cos(h.rot) * (d / 2 + 0.02)], [0, h.rot, 0]);
    b.add(kit.mat('#5B4636', { rough: 0.7 }), new THREE.BoxGeometry(1, 2.1, 0.1), [h.x + Math.sin(h.rot) * (d / 2 + 0.03), y + 1.05, h.z + Math.cos(h.rot) * (d / 2 + 0.03)], [0, h.rot, 0]);
    // Jardim da frente.
    for (let k = 0; k < 3; k++) b.add(leaf, new THREE.IcosahedronGeometry(0.7 + rnd() * 0.4, 1), [h.x + Math.sin(h.rot) * (d / 2 + 2) + Math.cos(h.rot) * (k - 1) * 2.4, y + 0.6, h.z + Math.cos(h.rot) * (d / 2 + 2) - Math.sin(h.rot) * (k - 1) * 2.4]);
  }
  return b.build();
}

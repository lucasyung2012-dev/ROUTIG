/**
 * Espaços de convivência (V2.1, seção 9) e residências fora da área explorável (13.8).
 * Tudo juntado por material: dezenas de peças em poucos desenhos por quadro.
 * Bancos e mirantes viram pontos de interação (sentar, observar).
 */
import * as THREE from 'three';
import { navGraph } from '@/domain/parkPeople';
import { onPath, PARK_BUILDINGS, PATH_WIDTH, PLAZA_RADIUS, POIS, ROAD_RADIUS, SPORT_FIELDS, heightAt, inWater, parkPaths, residences, samplePath, seededRandom, type Poi } from '@/domain/park';
import { Builder, type Kit } from '../kit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
    if (onPath(x, z, 0.9)) return;
    const y = heightAt(x, z);
    const back = face + Math.PI;
    b.add(wood, new THREE.BoxGeometry(1.8, 0.08, 0.5), [x, y + 0.45, z], [0, face, 0]);
    // Encosto inclinado para trás no eixo do próprio banco (antes inclinava num eixo fixo e entortava).
    const backrest = new THREE.BoxGeometry(1.8, 0.45, 0.07);
    backrest.rotateX(-0.12);
    b.add(wood, backrest, [x + Math.sin(back) * 0.26, y + 0.72, z + Math.cos(back) * 0.26], [0, face, 0]);
    for (const s of [-1, 1]) b.add(dark, new THREE.BoxGeometry(0.07, 0.45, 0.45), [x + Math.cos(face) * s * 0.8, y + 0.22, z - Math.sin(face) * s * 0.8], [0, face, 0]);
    seats.push({ x, y: y + 0.45, z, face });
  };
  /** Mesa de 0,75 m com dois bancos. */
  const table = (x: number, z: number, rot: number, umbrella: boolean) => {
    if (onPath(x, z, 1.4)) return;
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

  // Peças na altura de quem anda (postes, floreiras, degraus, balcões) não ficam em cima de caminho;
  // nem o que elas seguram (telhadinho de quiosque). Pisos rentes ao chão e vigas longas ficam.
  const rawAdd = b.add.bind(b);
  const box = new THREE.Box3();
  b.add = (m, g, pos, rot, sc) => {
    if (pos) {
      g.computeBoundingBox();
      box.copy(g.boundingBox!);
      const s = Math.max(...(sc ?? [1, 1, 1]));
      const ground = heightAt(pos[0], pos[2]);
      const top = pos[1] + box.max.y * s - ground;
      const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * s * 0.5;
      if (top > 0.3 && r < 3 && onPath(pos[0], pos[2], r * 0.6)) {
        g.dispose();
        return b;
      }
    }
    return rawAdd(m, g, pos, rot, sc);
  };
  // Pontos dos caminhos (para virar cafés e quiosques de frente para quem passa e pôr bancos à beira).
  const lines = parkPaths().filter((l) => l.kind !== 'trail');
  const pathPts = lines.flatMap((l) => samplePath(l.points, 3));
  const nearestPath = (x: number, z: number) => pathPts.reduce((m, q) => (Math.hypot(q.x - x, q.z - z) < Math.hypot(m.x - x, m.z - z) ? q : m), pathPts[0]!);
  for (const p of POIS) {
    const y = heightAt(p.x, p.z);
    const np = nearestPath(p.x, p.z);
    const toPath = Math.atan2(np.x - p.x, np.z - p.z);
    const fx = Math.sin(toPath);
    const fz = Math.cos(toPath);
    /** Ponto local (lx para o lado, lz para a frente = para o caminho) em coordenadas do mundo. */
    const L = (lx: number, lz: number): [number, number] => [p.x + lx * fz + lz * fx, p.z - lx * fx + lz * fz];
    spots.push({ id: p.id, x: p.x, z: p.z, kind: p.kind });
    switch (p.kind) {
      case 'cafe': {
        // Quiosque do café com toldo, balcão e mesas com guarda-sol.
        b.add(stone, new THREE.CylinderGeometry(9, 9, 0.12, 40), [p.x, y + 0.06, p.z]);
        // Virado para o caminho: balcão atrás, mesas alinhadas na frente.
        const [kx, kz] = L(0, -4);
        b.add(wood, new THREE.BoxGeometry(4.2, 2.8, 2.6), [kx, y + 1.4, kz], [0, toPath, 0]);
        b.add(kit.mat('#F4EFE6', { rough: 0.8 }), new THREE.BoxGeometry(4.4, 0.25, 2.8), [kx, y + 2.9, kz], [0, toPath, 0]);
        const [ax, az] = L(0, -2.4);
        b.add(kit.mat('#14B8A6', { rough: 0.6, side: THREE.DoubleSide }), new THREE.BoxGeometry(4.6, 0.06, 1.6), [ax, y + 2.55, az], [0, toPath, 0]);
        const [cx2, cz2] = L(0, -2.65);
        b.add(warm, new THREE.BoxGeometry(3.2, 0.6, 0.05), [cx2, y + 1.85, cz2], [0, toPath, 0]);
        for (let i = 0; i < 4; i++) {
          const [tx, tz] = L(-4.5 + i * 3, 1.5 + (i % 2) * 1.8);
          table(tx, tz, toPath + Math.PI / 2, true);
        }

        break;
      }
      case 'kiosk': {
        b.add(wood, new THREE.CylinderGeometry(1.6, 1.6, 2.4, 6), [p.x, y + 1.2, p.z], [0, toPath, 0]);
        b.add(kit.mat('#F97316', { rough: 0.5 }), new THREE.ConeGeometry(2.2, 1, 6), [p.x, y + 2.9, p.z], [0, toPath, 0]);
        const [wx, wz] = L(0, 1.45);
        b.add(warm, new THREE.BoxGeometry(1.4, 0.5, 0.05), [wx, y + 1.6, wz], [0, toPath, 0]);
        for (let i = 0; i < 2; i++) {
          const [tx, tz] = L(-2.6 + i * 5.2, 3.6);
          table(tx, tz, toPath + Math.PI / 2, false);
        }

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
        // Arquibancada em degraus (anéis de assento de 0,45 m), não blocos maciços.
        for (let k = 0; k < 4; k++) {
          const r0 = 8 + k * 1.2;
          const sh = new THREE.Shape();
          sh.absarc(0, 0, r0 + 1.2, Math.PI / 2 - 0.9, Math.PI / 2 + 0.9, false);
          sh.absarc(0, 0, r0, Math.PI / 2 + 0.9, Math.PI / 2 - 0.9, true);
          const g = new THREE.ExtrudeGeometry(sh, { depth: 0.45 + k * 0.45, bevelEnabled: false, curveSegments: 24 });
          g.rotateX(Math.PI / 2);
          g.translate(0, 0.45 + k * 0.45, 0);
          b.add(stone, g, [p.x, y, p.z], [0, p.view, 0]);
        }
        // Dá para sentar nos degraus da arquibancada, de frente para o palco.
        for (let k = 0; k < 4; k++)
          for (let i = 0; i < 9; i++) {
            const ang = Math.PI / 2 - 0.8 + (i / 8) * 1.6;
            const rr = 8 + k * 1.2 + 0.6;
            const lx = Math.cos(ang) * rr;
            const lz = Math.sin(ang) * rr;
            const cs = Math.cos(p.view);
            const sn = Math.sin(p.view);
            const wx = p.x + lx * cs + lz * sn;
            const wz = p.z - lx * sn + lz * cs;
            seats.push({ x: wx, y: y + 0.45 * (k + 1), z: wz, face: Math.atan2(p.x - wx, p.z - wz) });
          }

        break;
      }
    }
  }

  // Bancos à beira dos caminhos, de frente para eles, a cada ~40 m (longe de prédios, água e cruzamentos).
  const placed: Array<{ x: number; z: number }> = [];
  for (const l of lines) {
    const w = PATH_WIDTH[l.kind];
    const pts = samplePath(l.points, 40);
    pts.forEach((q, k) => {
      if (k === 0 || k === pts.length - 1) return;
      const nx = pts[k + 1]!;
      const dx = nx.x - q.x;
      const dz = nx.z - q.z;
      const len = Math.hypot(dx, dz) || 1;
      const side = k % 2 ? 1 : -1;
      const x = q.x + (-dz / len) * (w / 2 + 1.6) * side;
      const z = q.z + (dx / len) * (w / 2 + 1.6) * side;
      if (Math.hypot(x, z) < PLAZA_RADIUS + 4 || inWater(x, z, 2) || PARK_BUILDINGS.some((bd) => Math.hypot(x - bd.x, z - bd.z) < bd.radius * 0.95)) return;
      if (placed.some((o) => Math.hypot(o.x - x, o.z - z) < 25) || POIS.some((o) => Math.hypot(o.x - x, o.z - z) < 12)) return;
      if (pathPts.some((o) => Math.hypot(o.x - x, o.z - z) < w / 2 + 0.9)) return;
      placed.push({ x, z });
      bench(x, z, Math.atan2(q.x - x, q.z - z));
    });
  }

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
    // Casa assentada numa base nivelada (o terreno de fora \xE9 ondulado).
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
    // Caixa de correio e poste de luz do port\xE3o.
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
      // Rodap\xE9 de pedra e friso entre andares.
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
        // Colonial: telhado de duas \xE1guas, chamin\xE9 e varanda com colunas.
        const sh = new THREE.Shape([new THREE.Vector2(-(w / 2 + 0.6), 0), new THREE.Vector2(w / 2 + 0.6, 0), new THREE.Vector2(0, 2.6)]);
        const g = new THREE.ExtrudeGeometry(sh, { depth: d + 1, bevelEnabled: false });
        g.translate(0, 0, -(d + 1) / 2);
        put(roofM, g, 0, H, 0);
        put(stone, new THREE.BoxGeometry(0.8, 2.6, 0.8), w * 0.3, H + 1.3, -d * 0.2);
        put(deck, new THREE.BoxGeometry(w * 0.7, 0.2, 2.2), 0, 0.1, d / 2 + 1.1);
        for (const s of [-1, -0.33, 0.33, 1]) put(whiteTrim, new THREE.CylinderGeometry(0.12, 0.14, 2.7, 10), s * w * 0.33, 1.45, d / 2 + 2);
        put(roofM, new THREE.BoxGeometry(w * 0.74, 0.18, 2.6), 0, 2.85, d / 2 + 1.2);
      } else if (style === 2) {
        // Bangal\xF4: quatro \xE1guas, varanda de madeira e garagem.
        put(roofM, new THREE.CylinderGeometry(0.4, Math.max(w, d) * 0.72, 2.2, 4, 1), 0, H + 1.1, 0, Math.PI / 4, [w / Math.max(w, d), 1, d / Math.max(w, d)]);
        put(deck, new THREE.BoxGeometry(w + 1, 0.2, 2.6), 0, 0.1, d / 2 + 1.3);
        for (const s of [-1, 0, 1]) put(deck, new THREE.BoxGeometry(0.16, 2.6, 0.16), s * (w / 2), 1.4, d / 2 + 2.5);
        put(roofM, new THREE.BoxGeometry(w + 1.2, 0.15, 2.8), 0, 2.75, d / 2 + 1.3);
        put(wall, new THREE.BoxGeometry(3.6, 2.8, 6), w / 2 + 1.8, 1.4, 0.5);
        put(frame, new THREE.BoxGeometry(2.8, 2.3, 0.08), w / 2 + 1.8, 1.15, 3.52);
        put(slate, new THREE.BoxGeometry(4, 0.2, 6.4), w / 2 + 1.8, 2.9, 0.5);
      } else {
        // Sobrado tropical: telhado de uma \xE1gua, p\xE9rgola e piscina.
        const g = new THREE.BoxGeometry(w + 1.2, 0.25, d + 1.2);
        g.rotateX(0.12);
        put(roofM, g, 0, H + 0.6, 0);
        for (let k = 0; k < 7; k++) put(deck, new THREE.BoxGeometry(0.12, 0.18, 3.4), -w / 2 + 1 + k * 0.7, 2.9, d / 2 + 1.7);
        for (const s of [0, 1]) put(deck, new THREE.BoxGeometry(0.15, 2.9, 0.15), -w / 2 + 1 + s * 4.2, 1.45, d / 2 + 3.3);
        put(stone, new THREE.BoxGeometry(5.2, 0.12, 3.2), w / 2 - 2.8, 0.06, d / 2 + 3.6);
        put(pool, new THREE.BoxGeometry(4.6, 0.04, 2.6), w / 2 - 2.8, 0.14, d / 2 + 3.6);
      }
    }
    // \xC1rvore e arbustos do jardim.
    const tx = (rnd() > 0.5 ? 1 : -1) * (w / 2 + 1);
    put(doorMat, new THREE.CylinderGeometry(0.15, 0.22, 2.8, 8), tx, 1.4, d / 2 + 4);
    put(leaf, new THREE.IcosahedronGeometry(1.7, 1), tx, 3.6, d / 2 + 4, 0, [1, 0.85, 1]);
    for (let k = 0; k < 4; k++) put(hedge, new THREE.IcosahedronGeometry(0.5 + rnd() * 0.3, 1), -w / 2 + 1 + k * (w / 3.2), 0.45, d / 2 + 0.8);
  }
  return b.build();
}

/**
 * Instalações externas do Complexo Esportivo (V2.1, 11.13): quadra de tênis com linhas oficiais,
 * rede e bancos; campo de futebol com gramado listrado, linhas, círculo central, áreas, gols com
 * rede e uma pequena arquibancada.
 */
export function sportsFields(kit: Kit): THREE.Group {
  const b = new Builder();
  const line = kit.mat('#F8FAFC', { rough: 0.6 });
  const post = kit.mat('#D1D5DB', { metal: 0.7, rough: 0.3 });
  const netM = kit.mat('#E5E7EB', { glass: true, side: THREE.DoubleSide });
  const wood = kit.mat('#A0714F', { rough: 0.75 });
  const dark = kit.mat('#334155', { metal: 0.6, rough: 0.35 });
  const L = (w: number, d: number, x: number, z: number, y: number) => b.add(line, new THREE.BoxGeometry(w, 0.02, d), [x, y + 0.075, z]);

  // Tênis (23,77 × 10,97 m, ao longo de x).
  {
    const f = SPORT_FIELDS.tennis;
    const y = heightAt(f.x, f.z);
    b.add(kit.mat('#3E7D6B', { rough: 0.85 }), new THREE.BoxGeometry(f.w, 0.1, f.d), [f.x, y + 0.02, f.z]);
    b.add(kit.mat('#2F6CA8', { rough: 0.8 }), new THREE.BoxGeometry(23.77, 0.02, 10.97), [f.x, y + 0.075, f.z]);
    for (const s of [-1, 1]) {
      L(0.08, 10.97, f.x + s * 11.885, f.z, y);
      L(23.77, 0.06, f.x, f.z + s * 5.485, y);
      L(23.77, 0.06, f.x, f.z + s * 4.115, y);
      L(0.06, 8.23, f.x + s * 6.4, f.z, y);
      L(0.15, 0.06, f.x + s * 11.8, f.z, y);
      // Bancos e cadeira do juiz.
      b.add(wood, new THREE.BoxGeometry(2.4, 0.08, 0.5), [f.x + s * 4, y + 0.45, f.z + 7.6]);
      b.add(dark, new THREE.BoxGeometry(2.2, 0.45, 0.4), [f.x + s * 4, y + 0.22, f.z + 7.6]);
    }
    L(12.8, 0.06, f.x, f.z, y);
    for (const s of [-1, 1]) b.add(post, new THREE.CylinderGeometry(0.05, 0.05, 1.07, 8), [f.x, y + 0.6, f.z + s * 6.4]);
    b.add(netM, new THREE.BoxGeometry(0.02, 0.9, 12.8), [f.x, y + 0.53, f.z]);
    b.add(line, new THREE.BoxGeometry(0.04, 0.06, 12.8), [f.x, y + 1.0, f.z]);
    b.add(post, new THREE.BoxGeometry(0.6, 1.8, 0.6), [f.x, y + 0.9, f.z - 7.4]);
  }
  // Futebol (64 × 40 m).
  {
    const f = SPORT_FIELDS.football;
    const y = heightAt(f.x, f.z);
    for (let k = 0; k < 10; k++) b.add(kit.mat(k % 2 ? '#4F9A45' : '#5BA94F', { rough: 0.95 }), new THREE.BoxGeometry(f.w / 10, 0.1, f.d), [f.x - f.w / 2 + (k + 0.5) * (f.w / 10), y + 0.02, f.z]);
    const W = 64;
    const D = 40;
    for (const s of [-1, 1]) {
      L(W, 0.12, f.x, f.z + s * (D / 2), y);
      L(0.12, D, f.x + s * (W / 2), f.z, y);
      // Grande área e pequena área.
      L(0.12, 22, f.x + s * (W / 2 - 13), f.z, y);
      L(13, 0.12, f.x + s * (W / 2 - 6.5), f.z + 11, y);
      L(13, 0.12, f.x + s * (W / 2 - 6.5), f.z - 11, y);
      L(0.12, 10, f.x + s * (W / 2 - 4.5), f.z, y);
      L(4.5, 0.12, f.x + s * (W / 2 - 2.25), f.z + 5, y);
      L(4.5, 0.12, f.x + s * (W / 2 - 2.25), f.z - 5, y);
      // Gol com rede.
      const gx = f.x + s * (W / 2 + 0.05);
      for (const z of [-2.5, 2.5]) b.add(line, new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), [gx, y + 1.15, f.z + z]);
      b.add(line, new THREE.CylinderGeometry(0.06, 0.06, 5.1, 8), [gx, y + 2.25, f.z], [Math.PI / 2, 0, 0]);
      b.add(netM, new THREE.BoxGeometry(0.02, 2.2, 5), [gx + s * 1.4, y + 1.1, f.z]);
      for (const z of [-2.5, 2.5]) b.add(netM, new THREE.BoxGeometry(1.4, 2.2, 0.02), [gx + s * 0.7, y + 1.1, f.z + z]);
    }
    L(0.12, D, f.x, f.z, y);
    b.add(line, new THREE.TorusGeometry(6, 0.06, 4, 48), [f.x, y + 0.075, f.z], [Math.PI / 2, 0, 0]);
    // Arquibancada pequena ao lado.
    for (let k = 0; k < 3; k++) b.add(kit.mat('#CBD5E1', { rough: 0.7 }), new THREE.BoxGeometry(30, 0.45 * (k + 1), 1), [f.x, y + 0.225 * (k + 1), f.z - f.d / 2 - 1.5 - k]);
  }
  return b.build();
}

/**
 * Bairro em volta do campus (V2.1, 13.8): rua com calçadas e postes contornando o parque,
 * caminhos ligando os portões do parque à rua, e uma faixa de prédios residenciais e comerciais
 * (4 a 8 andares, janelas que acendem à noite, varandas, térreo com lojas) atrás das casas.
 */
export function neighborhood(kit: Kit): { group: THREE.Group; tick: (t: number) => void } {
  const g = new THREE.Group();
  const b = new Builder();
  const asphalt = kit.mat('#4A4F57', { rough: 0.9 });
  const walk = kit.mat('#C9C2B4', { rough: 0.9 });
  const stripe = kit.mat('#F2E6B8', { rough: 0.7 });
  const pole = kit.mat('#334155', { metal: 0.8, rough: 0.3 });
  const light = kit.mat('#FFE7B0', { glow: true });
  const N = 220;
  const ring = (r: number, w: number, mat: THREE.Material, lift: number) => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      for (const rr of [r - w / 2, r + w / 2]) {
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        pos.push(x, heightAt(x, z) + lift, z);
      }
      if (i > 0) {
        const k = (i - 1) * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    b.add(mat, geo);
  };
  ring(ROAD_RADIUS, 7, asphalt, 0.06);
  ring(ROAD_RADIUS - 5, 3, walk, 0.1);
  ring(ROAD_RADIUS + 5, 3, walk, 0.1);
  // Faixa central tracejada e postes alternados.
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const x = Math.cos(a) * ROAD_RADIUS;
    const z = Math.sin(a) * ROAD_RADIUS;
    b.add(stripe, new THREE.BoxGeometry(0.15, 0.02, 4), [x, heightAt(x, z) + 0.08, z], [0, -a, 0]);
    if (i % 4 === 0) {
      const rr = ROAD_RADIUS + (i % 8 === 0 ? -6.2 : 6.2);
      const lx = Math.cos(a) * rr;
      const lz = Math.sin(a) * rr;
      const ly = heightAt(lx, lz);
      b.add(pole, new THREE.CylinderGeometry(0.08, 0.12, 6, 8), [lx, ly + 3, lz]);
      b.add(pole, new THREE.BoxGeometry(0.1, 0.1, 1.4), [lx - Math.cos(a) * Math.sign(rr - ROAD_RADIUS) * 0.7, ly + 6, lz - Math.sin(a) * Math.sign(rr - ROAD_RADIUS) * 0.7], [0, -a + Math.PI / 2, 0]);
      b.add(light, new THREE.BoxGeometry(0.4, 0.12, 0.25), [lx - Math.cos(a) * Math.sign(rr - ROAD_RADIUS) * 1.3, ly + 5.92, lz - Math.sin(a) * Math.sign(rr - ROAD_RADIUS) * 1.3]);
    }
  }
  // Caminhos dos portões do parque até a calçada.
  const pave = kit.mat('#DCD3C0', { rough: 0.85 });
  for (const gi of navGraph().gates) {
    const p = navGraph().nodes[gi]!;
    const a = Math.atan2(p.z, p.x);
    const r0 = Math.hypot(p.x, p.z);
    const len = ROAD_RADIUS - 6.5 - r0;
    if (len <= 0) continue;
    const mx = Math.cos(a) * (r0 + len / 2);
    const mz = Math.sin(a) * (r0 + len / 2);
    const steps = Math.max(2, Math.ceil(len / 3));
    for (let k = 0; k < steps; k++) {
      const rr = r0 + ((k + 0.5) / steps) * len;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      b.add(pave, new THREE.BoxGeometry(2.6, 0.12, len / steps + 0.05), [x, heightAt(x, z) + 0.05, z], [0, Math.PI / 2 - a, 0]);
    }
    void mx;
    void mz;
  }
  // Faixas de pedestre em cada portão do parque.
  for (const gi of navGraph().gates) {
    const p = navGraph().nodes[gi]!;
    const a = Math.atan2(p.z, p.x);
    for (let k = -3; k <= 3; k++) {
      const t = a + (k * 0.6) / ROAD_RADIUS;
      const x = Math.cos(t) * ROAD_RADIUS;
      const z = Math.sin(t) * ROAD_RADIUS;
      b.add(stripe, new THREE.BoxGeometry(6.4, 0.02, 0.35), [x, heightAt(x, z) + 0.085, z], [0, -t, 0]);
    }
  }
  // Prédios do bairro: residenciais (varandas, janelas nos quatro lados, caixa-d'água) e
  // comerciais (pele de vidro, letreiro), térreo com lojas, marquises e toldos.
  const rnd = seededRandom(909);
  const facades = ['#E8E2D6', '#D9DEE5', '#EADCCB', '#CFD8DC', '#E4D5C3', '#DDE6E1', '#C9B8A6', '#B8C4CF'].map((c) => kit.mat(c, { rough: 0.85 }));
  const glassDay = kit.mat('#6F93AE', { rough: 0.15, metal: 0.5 });
  const glassLit = kit.mat('#FFE2A8', { glow: true, rough: 0.35 });
  const curtain = kit.mat('#7FA4BF', { glass: true });
  const dark = kit.mat('#3A4250', { rough: 0.5, metal: 0.3 });
  const trim = kit.mat('#F4F5F7', { rough: 0.6 });
  const frameW = kit.mat('#E9ECEF', { rough: 0.5 });
  const shop = kit.mat('#9FD3E8', { glass: true });
  const rail = kit.mat('#CFE7F5', { glass: true });
  const leafM = kit.mat('#4C9A4F', { rough: 0.9 });
  const tankM = kit.mat('#E5E7EB', { rough: 0.5, metal: 0.2 });
  const awnings = ['#14B8A6', '#F59E0B', '#EF4444', '#6366F1', '#16A34A', '#DB2777'].map((c) => kit.mat(c, { rough: 0.6 }));
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + (rnd() - 0.5) * 0.08;
    const rr = ROAD_RADIUS + 70 + rnd() * 30;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const y = Math.min(heightAt(x - 8, z - 8), heightAt(x + 8, z + 8), heightAt(x, z));
    const commercial = i % 5 === 2;
    const floors = commercial ? 3 + Math.floor(rnd() * 3) : 4 + Math.floor(rnd() * 5);
    const fh = 3.1;
    const w = 16 + rnd() * 10;
    const d = 12 + rnd() * 6;
    const rot = Math.PI / 2 - a + Math.PI;
    const H = floors * fh + 4;
    const P = (lx: number, ly: number, lz: number): [number, number, number] => [x + lx * Math.cos(rot) + lz * Math.sin(rot), y + ly, z - lx * Math.sin(rot) + lz * Math.cos(rot)];
    const R: [number, number, number] = [0, rot, 0];
    const fac = facades[i % facades.length]!;
    b.add(kit.mat('#B9B3A8', { rough: 0.95 }), new THREE.BoxGeometry(w + 2, 2, d + 2), P(0, -1, 0), R);
    b.add(commercial ? curtain : fac, new THREE.BoxGeometry(w, H, d), P(0, H / 2, 0), R);
    // Térreo: lojas com vitrine, porta, letreiro aceso e toldo; marquise sobre a calçada.
    const shops = Math.max(2, Math.floor(w / 6));
    for (let k = 0; k < shops; k++) {
      const sw = w / shops;
      const lx = -w / 2 + sw * (k + 0.5);
      b.add(shop, new THREE.BoxGeometry(sw - 0.5, 2.8, 0.1), P(lx, 1.5, d / 2 + 0.03), R);
      b.add(dark, new THREE.BoxGeometry(0.12, 3.2, 0.2), P(lx - sw / 2 + 0.1, 1.6, d / 2 + 0.05), R);
      b.add(dark, new THREE.BoxGeometry(1.1, 2.3, 0.12), P(lx + sw * 0.25, 1.15, d / 2 + 0.08), R);
      b.add(awnings[(i + k) % awnings.length]!, new THREE.BoxGeometry(sw - 0.6, 0.12, 1.5), P(lx, 3.3, d / 2 + 0.75), [0.18, rot, 0]);
      b.add(glassLit, new THREE.BoxGeometry(sw * 0.6, 0.45, 0.08), P(lx, 3.75, d / 2 + 0.06), R);
    }
    // Andares: janelas com caixilho nos quatro lados, faixa de laje, varandas e ar-condicionado.
    for (let f = 0; f < floors; f++) {
      const fy = 4 + f * fh + 1.5;
      b.add(trim, new THREE.BoxGeometry(w + 0.16, 0.18, d + 0.16), P(0, fy - 1.55, 0), R);
      if (commercial) continue;
      // Janelas na frente (para o parque) e nas laterais; os fundos nunca aparecem do parque.
      for (const side of [1]) {
        for (let k = 0; k < Math.floor(w / 3); k++) {
          const lx = -w / 2 + 1.6 + k * 3;
          const lit = rnd() > 0.75;
          b.add(frameW, new THREE.BoxGeometry(1.75, 1.65, 0.06), P(lx, fy, side * (d / 2 + 0.02)), R);
          b.add(lit ? glassLit : glassDay, new THREE.BoxGeometry(1.55, 1.45, 0.06), P(lx, fy, side * (d / 2 + 0.05)), R);
          b.add(frameW, new THREE.BoxGeometry(0.05, 1.45, 0.08), P(lx, fy, side * (d / 2 + 0.07)), R);
        }
      }
      for (const side of [1, -1])
        for (let k = 0; k < Math.floor(d / 3.5); k++) {
          const lz = -d / 2 + 1.8 + k * 3.5;
          b.add(frameW, new THREE.BoxGeometry(0.06, 1.65, 1.75), P(side * (w / 2 + 0.02), fy, lz), R);
          b.add(glassDay, new THREE.BoxGeometry(0.06, 1.45, 1.55), P(side * (w / 2 + 0.05), fy, lz), R);
        }
      if (f % 2 === 0) {
        // Varanda com guarda-corpo de vidro e um vaso.
        b.add(trim, new THREE.BoxGeometry(w * 0.4, 0.15, 1.3), P(-w * 0.2, fy - 1.4, d / 2 + 0.65), R);
        b.add(rail, new THREE.BoxGeometry(w * 0.4, 1.0, 0.04), P(-w * 0.2, fy - 0.85, d / 2 + 1.28), R);
        b.add(leafM, new THREE.IcosahedronGeometry(0.35, 1), P(-w * 0.35, fy - 1.0, d / 2 + 0.8), R);
      } else b.add(tankM, new THREE.BoxGeometry(0.8, 0.5, 0.4), P(w * 0.3, fy - 0.9, d / 2 + 0.25), R);
    }
    if (commercial) {
      // Montantes da pele de vidro e letreiro no alto.
      for (let k = 0; k <= Math.floor(w / 2); k++) b.add(dark, new THREE.BoxGeometry(0.1, H - 4, 0.14), P(-w / 2 + k * 2, 4 + (H - 4) / 2, d / 2 + 0.05), R);
      b.add(glassLit, new THREE.BoxGeometry(w * 0.5, 1.2, 0.2), P(0, H - 1, d / 2 + 0.15), R);
    }
    // Cobertura: platibanda, caixa-d'água, casa de máquinas e antena.
    for (const [sx, sz, lw, ld] of [[0, d / 2, w, 0.3], [0, -d / 2, w, 0.3], [w / 2, 0, 0.3, d], [-w / 2, 0, 0.3, d]] as const) b.add(dark, new THREE.BoxGeometry(lw + 0.3, 0.9, ld + 0.3), P(sx, H + 0.45, sz), R);
    b.add(tankM, new THREE.CylinderGeometry(1.1, 1.1, 2.2, 16), P(-w * 0.25, H + 1.6, -d * 0.15), R);
    b.add(dark, new THREE.BoxGeometry(3, 2.2, 3), P(w * 0.22, H + 1.1, 0), R);
    b.add(dark, new THREE.CylinderGeometry(0.05, 0.05, 4, 6), P(w * 0.3, H + 4, d * 0.2), R);
  }
  g.add(b.build());
  // Carros: estacionados junto à calçada externa e rodando na rua (poucas instâncias, um desenho só).
  const carGeo = (() => {
    const body = new THREE.BoxGeometry(1.8, 0.65, 4.2);
    body.translate(0, 0.55, 0);
    const cab = new THREE.BoxGeometry(1.6, 0.55, 2.2);
    cab.translate(0, 1.1, -0.2);
    const parts: THREE.BufferGeometry[] = [body, cab];
    for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]] as const) {
      const wh = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12);
      wh.rotateZ(Math.PI / 2);
      wh.translate(wx, 0.34, wz);
      parts.push(wh);
    }
    return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  })();
  const glassCar = (() => {
    const gl = new THREE.BoxGeometry(1.62, 0.42, 2.0);
    gl.translate(0, 1.12, -0.2);
    return gl;
  })();
  const parked = 70;
  const moving = 10;
  const cars = new THREE.InstancedMesh(kit.own(carGeo), kit.mat('#ffffff', { rough: 0.35, metal: 0.4 }), parked + moving);
  const windows = new THREE.InstancedMesh(kit.own(glassCar), kit.mat('#1F2A36', { rough: 0.1, metal: 0.6 }), parked + moving);
  cars.castShadow = true;
  const carColors = ['#E5E7EB', '#1F2937', '#9CA3AF', '#B91C1C', '#1D4ED8', '#F8FAFC', '#065F46', '#78716C'];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  const placeCar = (i: number, a: number, r: number, dir: number) => {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + (dir > 0 ? 0 : Math.PI));
    m4.compose(new THREE.Vector3(x, heightAt(x, z) + 0.06, z), q, one);
    cars.setMatrixAt(i, m4);
    windows.setMatrixAt(i, m4);
  };
  const gates = navGraph().gates.map((gi) => {
    const p = navGraph().nodes[gi]!;
    return Math.atan2(p.z, p.x);
  });
  let pk = 0;
  for (let k = 0; k < 400 && pk < parked; k++) {
    const a = (k / 400) * Math.PI * 2;
    if (rnd() > 0.35 || gates.some((gA) => Math.abs(Math.atan2(Math.sin(a - gA), Math.cos(a - gA))) < 0.03)) continue;
    placeCar(pk, a, ROAD_RADIUS + 2.4, k % 2 ? 1 : -1);
    cars.setColorAt(pk++, col.set(carColors[Math.floor(rnd() * carColors.length)]!));
  }
  const lanes = Array.from({ length: moving }, (_, k) => ({ a: (k / moving) * Math.PI * 2, dir: k % 2 ? 1 : -1, speed: 7 + rnd() * 4 }));
  lanes.forEach((_, k) => cars.setColorAt(parked + k, col.set(carColors[(k * 3) % carColors.length]!)));
  cars.count = windows.count = pk + moving;
  g.add(cars, windows);
  let last = 0;
  const tick = (t: number) => {
    const dt = last ? Math.min(0.1, t - last) : 0;
    last = t;
    lanes.forEach((l, k) => {
      // Mão dupla: cada sentido na sua faixa; carros andam devagar (rua de bairro).
      l.a += (l.dir * l.speed * dt) / ROAD_RADIUS;
      placeCar(pk + k, l.a, ROAD_RADIUS + (l.dir > 0 ? 1.7 : -1.7), l.dir);
    });
    cars.instanceMatrix.needsUpdate = true;
    windows.instanceMatrix.needsUpdate = true;
  };
  return { group: g, tick };
}

/** Árvores da calçada externa do bairro (fora do campus), uma a cada ~15 m, longe dos portões. */
export function streetTrees(): Array<{ x: number; z: number; s: number }> {
  const out: Array<{ x: number; z: number; s: number }> = [];
  const houses = residences();
  const gates = navGraph().gates.map((gi) => {
    const p = navGraph().nodes[gi]!;
    return Math.atan2(p.z, p.x);
  });
  const n = Math.round((Math.PI * 2 * (ROAD_RADIUS + 6.5)) / 15);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    if (gates.some((gA) => Math.abs(Math.atan2(Math.sin(a - gA), Math.cos(a - gA))) < 0.04)) continue;
    for (const r of [ROAD_RADIUS + 7.6, ROAD_RADIUS - 7.6]) {
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < 13)) continue;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.8 + ((k * 37) % 10) / 30 });
    }
  }
  return out;
}

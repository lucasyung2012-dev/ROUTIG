/**
 * Marcos das áreas temáticas do Campus: uma peça de referência perto do centro de cada área, que
 * se vê de longe e diz onde se está sem precisar de placa — junto com a cor do gramado, as árvores,
 * o piso dos caminhos e as flores de cada área (world.ts, grass.ts).
 * - Conhecimento: Pórtico do Saber (colunata de pedra em círculo, com um livro de bronze no meio).
 * - Planejamento: Relógio de Sol entre sebes aparadas em quadrado (o tempo organizado).
 * - Desenvolvimento pessoal: Árvore em Flor num canteiro redondo, com bancos em volta.
 * - Atividades: Pórtico das Atividades (arco terracota) sobre um anel de pista.
 * - Finanças: Obelisco de granito escuro com ponta dourada, num espelho d'água quadrado.
 * Cada marco fica fora dos caminhos, lotes, água e pontos de convivência (isFreeGround).
 */
import * as THREE from 'three';
import { COURTS, REGION_HUB, heightAt, isFreeGround, type ParkRegion, type Point } from '@/domain/park';
import { Builder, type Kit } from './kit';

/** Lugar livre perto de um ponto (anéis de raio crescente), virado para ele. */
function spotNear(p: Point, minR: number, maxR: number, pad: number): Point & { face: number } {
  for (let r = minR; r <= maxR; r += 2)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + r * 0.13;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (isFreeGround(x, z, pad)) return { x, z, face: Math.atan2(p.x - x, p.z - z) };
    }
  return { x: p.x + minR, z: p.z, face: 0 };
}

/** Peça posicionada no referencial do marco (giro `rot` em volta do centro). */
function placer(b: Builder, x: number, y: number, z: number, rot: number) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (mat: THREE.Material, g: THREE.BufferGeometry, lx: number, ly: number, lz: number, r: [number, number, number] = [0, 0, 0]) =>
    // Peças deitadas (anéis, aros) são redondas: não precisam girar com o marco (e girar antes de
    // deitar as inclinaria).
    b.add(mat, g, [x + lx * c + lz * s, y + ly, z - lx * s + lz * c], r[0] !== 0 ? r : [r[0], r[1] + rot, r[2]]);
}

export interface Landmark {
  theme: ParkRegion;
  x: number;
  z: number;
}

export function landmarks(kit: Kit): { group: THREE.Group; list: Landmark[] } {
  const b = new Builder();
  const list: Landmark[] = [];
  const base = (p: Point) => heightAt(p.x, p.z) - 0.25;

  // Conhecimento: Pórtico do Saber.
  {
    const p = spotNear(REGION_HUB.knowledge, 10, 30, 6);
    const put = placer(b, p.x, base(p), p.z, p.face);
    const stone = kit.mat('#D9CFBD', { rough: 0.8 });
    const bronze = kit.mat('#8C6A3F', { metal: 0.7, rough: 0.35 });
    put(stone, new THREE.CylinderGeometry(4.6, 4.8, 0.55, 40), 0, 0.27, 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      put(stone, new THREE.CylinderGeometry(0.26, 0.3, 4.2, 14), Math.sin(a) * 3.6, 2.65, Math.cos(a) * 3.6);
      put(stone, new THREE.BoxGeometry(0.75, 0.22, 0.75), Math.sin(a) * 3.6, 0.66, Math.cos(a) * 3.6, [0, a, 0]);
    }
    put(stone, new THREE.TorusGeometry(3.6, 0.32, 10, 48), 0, 4.9, 0, [Math.PI / 2, 0, 0]);
    // Livro aberto de bronze sobre um pedestal.
    put(stone, new THREE.BoxGeometry(0.9, 1.1, 0.7), 0, 1.1, 0);
    put(bronze, new THREE.BoxGeometry(0.62, 0.05, 0.85), -0.3, 1.74, 0, [0, 0, 0.22]);
    put(bronze, new THREE.BoxGeometry(0.62, 0.05, 0.85), 0.3, 1.74, 0, [0, 0, -0.22]);
    list.push({ theme: 'knowledge', x: p.x, z: p.z });
  }

  // Planejamento: Relógio de Sol entre sebes aparadas.
  {
    const p = spotNear(COURTS.planning!, 12, 34, 6);
    const put = placer(b, p.x, base(p), p.z, p.face);
    const granite = kit.mat('#C9CED4', { rough: 0.55 });
    const steel = kit.mat('#5B6470', { metal: 0.85, rough: 0.3 });
    const hedge = kit.mat('#3E7B3A', { rough: 0.95 });
    put(granite, new THREE.CylinderGeometry(3.4, 3.6, 0.6, 48), 0, 0.3, 0);
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      put(steel, new THREE.BoxGeometry(0.12, 0.05, h % 3 === 0 ? 0.7 : 0.4), Math.sin(a) * 2.8, 0.63, Math.cos(a) * 2.8, [0, a, 0]);
    }
    // Gnômon: lâmina inclinada que projeta a sombra das horas.
    const blade = new THREE.Shape();
    blade.moveTo(0, 0);
    blade.lineTo(2.4, 0);
    blade.lineTo(0, 1.9);
    blade.closePath();
    const g = new THREE.ExtrudeGeometry(blade, { depth: 0.1, bevelEnabled: false });
    g.translate(-1.2, 0, -0.05);
    put(steel, g, 0, 0.6, 0, [0, Math.PI / 2, 0]);
    for (const [sx, sz] of [[-5.2, -5.2], [5.2, -5.2], [-5.2, 5.2], [5.2, 5.2]] as const) put(hedge, new THREE.BoxGeometry(1.6, 1.1, 1.6), sx, 0.8, sz);
    list.push({ theme: 'planning', x: p.x, z: p.z });
  }

  // Desenvolvimento pessoal: Árvore em Flor num canteiro redondo, bancos em volta.
  {
    const p = spotNear(COURTS.growth!, 10, 30, 6);
    const put = placer(b, p.x, base(p), p.z, p.face);
    const sand = kit.mat('#D8C49A', { rough: 0.85 });
    const soil = kit.mat('#5A4632', { rough: 1 });
    const bark = kit.mat('#6B4A33', { rough: 0.95 });
    const bloom = kit.mat('#F2A6C8', { rough: 0.8 });
    const bloom2 = kit.mat('#E879B0', { rough: 0.8 });
    const wood = kit.mat('#9A6B43', { rough: 0.8 });
    put(sand, new THREE.CylinderGeometry(3, 3.2, 0.9, 40), 0, 0.45, 0);
    put(soil, new THREE.CylinderGeometry(2.7, 2.7, 0.06, 40), 0, 0.92, 0);
    put(bark, new THREE.CylinderGeometry(0.22, 0.34, 3, 10), 0, 2.4, 0);
    put(bark, new THREE.CylinderGeometry(0.1, 0.16, 1.6, 8), 0.5, 3.6, 0.1, [0, 0, -0.6]);
    put(bark, new THREE.CylinderGeometry(0.1, 0.16, 1.6, 8), -0.45, 3.5, -0.2, [0.3, 0, 0.6]);
    put(bloom, new THREE.IcosahedronGeometry(1.7, 1), 0, 4.6, 0);
    put(bloom2, new THREE.IcosahedronGeometry(1.2, 1), 1.2, 4.2, 0.4);
    put(bloom, new THREE.IcosahedronGeometry(1.1, 1), -1.1, 4.3, -0.5);
    put(bloom2, new THREE.IcosahedronGeometry(1, 1), 0.2, 5.4, -0.9);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      put(wood, new THREE.BoxGeometry(1.5, 0.08, 0.45), Math.sin(a) * 4.3, 0.75, Math.cos(a) * 4.3, [0, a + Math.PI / 2, 0]);
      put(sand, new THREE.BoxGeometry(0.3, 0.7, 0.35), Math.sin(a) * 4.3, 0.35, Math.cos(a) * 4.3, [0, a + Math.PI / 2, 0]);
    }
    list.push({ theme: 'growth', x: p.x, z: p.z });
  }

  // Atividades: Pórtico das Atividades sobre um anel de pista.
  {
    const p = spotNear(REGION_HUB.activity, 12, 34, 7);
    const put = placer(b, p.x, base(p), p.z, p.face);
    const clay = kit.mat('#E2552D', { rough: 0.6 });
    const track = kit.mat('#B5523A', { rough: 0.9 });
    const white = kit.mat('#F5F5F4', { rough: 0.7 });
    put(track, new THREE.RingGeometry(4.4, 5.6, 48), 0, 0.3, 0, [-Math.PI / 2, 0, 0]);
    put(white, new THREE.RingGeometry(4.95, 5.05, 48), 0, 0.31, 0, [-Math.PI / 2, 0, 0]);
    put(kit.mat('#8E5E48', { rough: 0.9 }), new THREE.CylinderGeometry(5.7, 5.9, 0.3, 48), 0, 0.15, 0);
    for (const s of [-1, 1]) put(clay, new THREE.BoxGeometry(0.7, 5.2, 0.7), s * 3, 2.9, 0);
    const arch = new THREE.TorusGeometry(3, 0.32, 10, 32, Math.PI);
    put(clay, arch, 0, 5.5, 0);
    put(white, new THREE.TorusGeometry(3, 0.08, 6, 32, Math.PI), 0, 5.5, 0.3);
    list.push({ theme: 'activity', x: p.x, z: p.z });
  }

  // Finanças: Obelisco de granito escuro num espelho d'água quadrado.
  {
    const p = spotNear(COURTS.finance!, 10, 30, 6);
    const put = placer(b, p.x, base(p), p.z, p.face);
    const dark = kit.mat('#2F3640', { rough: 0.3, metal: 0.2 });
    const granite = kit.mat('#4A5260', { rough: 0.45 });
    const gold = kit.mat('#C9A227', { metal: 0.9, rough: 0.25 });
    const pool = kit.mat('#4E83A6', { rough: 0.08, metal: 0.3 });
    put(granite, new THREE.BoxGeometry(7, 0.5, 7), 0, 0.25, 0);
    for (const [sx, sz, w, d] of [[0, -3.2, 7, 0.6], [0, 3.2, 7, 0.6], [-3.2, 0, 0.6, 7], [3.2, 0, 0.6, 7]] as const) put(granite, new THREE.BoxGeometry(w, 0.35, d), sx, 0.67, sz);
    put(pool, new THREE.BoxGeometry(5.8, 0.06, 5.8), 0, 0.62, 0);
    put(granite, new THREE.BoxGeometry(1.8, 0.8, 1.8), 0, 0.9, 0);
    put(dark, new THREE.CylinderGeometry(0.42, 0.85, 6.5, 4), 0, 4.55, 0, [0, Math.PI / 4, 0]);
    put(gold, new THREE.ConeGeometry(0.6, 0.9, 4), 0, 8.25, 0, [0, Math.PI / 4, 0]);
    list.push({ theme: 'finance', x: p.x, z: p.z });
  }

  const group = b.build();
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });
  return { group, list };
}

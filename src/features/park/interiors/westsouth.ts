/**
 * Interiores das regiões Oeste e Sul: Jardim da Concentração (Focus), Estufa de Hábitos, Jardim das
 * Conquistas (Goals), Música e Complexo Esportivo. Canteiros, pedestais, salas e placas levam os
 * nomes reais dos hábitos, metas, instrumentos e modalidades do usuário. Nada de pontos ou XP:
 * a vegetação e os objetos são só visuais.
 */
import * as THREE from 'three';
import type { Kit } from '../kit';
import { createRoom, finishRoom, pendants, pots, bench, setDetailCommon, type InteriorScene } from './common';
import { sectorsFrom, viewOf, type Placed } from './central';
import { nameBoard } from './north';

export interface NamesData {
  names: string[];
}

/** Placas que recebem nomes reais, em anel. */
function boardsRing(kit: Kit, scene: THREE.Scene, n: number, r: number, y: number, accent: string, skip = 0.5) {
  const boards: Array<ReturnType<typeof nameBoard>> = [];
  const spots: Array<{ x: number; z: number; a: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2 + Math.PI;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < skip) continue;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const board = nameBoard(kit, 3, accent);
    board.mesh.position.set(x, y, z);
    board.mesh.rotation.y = a + Math.PI;
    scene.add(board.mesh);
    boards.push(board);
    spots.push({ x, z, a });
  }
  return { boards, spots, set: (names: string[]) => boards.forEach((b, i) => b.draw(names[i] ?? '')) };
}

/* =====================================================================
 * FOCUS — jardim interno com água ao centro, nichos de concentração em volta
 * ===================================================================== */
export const FOCUS_SECTORS = ['garden', 'history', 'distraction'] as const;
export type FocusSector = (typeof FOCUS_SECTORS)[number];

export function createFocusInterior(kit: Kit, labels: Record<FocusSector, string>): InteriorScene {
  const R = 15;
  const H = 7;
  const room = createRoom(kit, { radius: R, height: H, sides: 32, floor: '#E8EEE9', glass: '#CDEFE6', frame: '#E2E8F0', accent: '#5EEAD4', skylight: 6 });
  const { scene, b } = room;
  const wood = kit.mat('#C9A27A', { rough: 0.7 });
  b.add(kit.mat('#3E8FC9', { rough: 0.06, metal: 0.4 }), new THREE.CircleGeometry(5, 40), [0, 0.02, 0], [-Math.PI / 2, 0, 0]);
  b.add(kit.mat('#5E9E4C', { rough: 1 }), new THREE.CylinderGeometry(2, 2.2, 0.4, 24), [0, 0.2, 0]);
  b.add(kit.mat('#6B4A33'), new THREE.CylinderGeometry(0.18, 0.25, 2.6, 8), [0, 1.6, 0]);
  b.add(kit.mat('#4C9A4F', { rough: 0.9 }), new THREE.IcosahedronGeometry(1.7, 1), [0, 3.4, 0]);
  // Nichos de concentração: poltrona única voltada para o vidro.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (Math.cos(a) > 0.8) continue;
    const x = Math.sin(a) * 11.5;
    const z = Math.cos(a) * 11.5;
    b.add(kit.mat('#7FA89A', { rough: 0.8 }), new THREE.BoxGeometry(1.2, 0.5, 1.1), [x, 0.25, z], [0, a, 0]);
    b.add(kit.mat('#7FA89A', { rough: 0.8 }), new THREE.BoxGeometry(1.2, 0.9, 0.25), [x - Math.sin(a) * 0.45, 0.7, z - Math.cos(a) * 0.45], [0, a, 0]);
  }
  pots(kit, b, [[-7, 6], [7, 6], [-7, -6], [7, -6]]);
  const plan: Record<FocusSector, Placed> = {
    garden: { x: 0, z: 7.5, face: Math.PI },
    history: { x: -8, z: -5, face: Math.PI * 0.7 },
    distraction: { x: 8, z: -5, face: -Math.PI * 0.7 },
  };
  const groups = sectorsFrom(kit, scene, plan, FOCUS_SECTORS, labels, '#5EEAD4', (id, sb) => {
    if (id === 'distraction') {
      sb.add(wood, new THREE.BoxGeometry(0.8, 1.8, 0.4), [0, 0.9, -0.4]);
      sb.add(kit.mat('#5EEAD4', { glow: true }), new THREE.BoxGeometry(0.6, 0.9, 0.05), [0, 1.2, -0.17]);
    } else {
      sb.add(wood, new THREE.BoxGeometry(2.4, 0.08, 0.9), [0, 0.6, 0]);
      sb.add(wood, new THREE.BoxGeometry(0.1, 0.6, 0.8), [-1.1, 0.3, 0]);
      sb.add(wood, new THREE.BoxGeometry(0.1, 0.6, 0.8), [1.1, 0.3, 0]);
    }
  });
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 5, R - 2), target: new THREE.Vector3(0, 1.5, -2) };
  return {
    scene,
    sectors: FOCUS_SECTORS,
    pickables: groups,
    room: { radius: R - 1.5, height: H },
    obstacles: [{ x: 0, z: 0, r: 5.2, h: 0.5 }],
    view: (id) => viewOf(plan, id, overview),
    setData: () => undefined,
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * HABITS — nave da estufa com um canteiro por hábito (nome na placa)
 * ===================================================================== */
export const HABITS_SECTORS = ['atrium', 'greenhouse', 'evolution', 'analysis'] as const;
export type HabitsSector = (typeof HABITS_SECTORS)[number];

export function createHabitsInterior(kit: Kit, labels: Record<HabitsSector, string>): InteriorScene {
  const R = 18;
  const H = 10;
  const room = createRoom(kit, { radius: R, height: H, sides: 12, floor: '#E6EDE2', glass: '#D8F2DE', frame: '#6B7F75', accent: '#E6B450', skylight: 8 });
  const { scene, b } = room;
  const frame = kit.mat('#6B7F75', { metal: 0.6, rough: 0.35 });
  for (let i = 0; i < 6; i++) b.add(frame, new THREE.TorusGeometry(R - 1, 0.1, 6, 32, Math.PI), [0, 0, 0], [0, (i / 6) * Math.PI, 0], [1, 0.55, 1]);
  // Canteiros (um por hábito) com plantas variadas.
  const names = boardsRing(kit, scene, 7, 12.5, 2.2, '#E6B450', 0.6);
  names.spots.forEach((s, i) => {
    b.add(kit.mat('#8A6240', { rough: 0.8 }), new THREE.BoxGeometry(3.2, 0.5, 2), [s.x * 0.92, 0.25, s.z * 0.92], [0, s.a, 0]);
    for (let k = 0; k < 3; k++) b.add(kit.mat(['#4C9A4F', '#6BAA4E', '#3E8E4A'][(i + k) % 3]!, { rough: 0.9 }), new THREE.IcosahedronGeometry(0.5 + ((i + k) % 3) * 0.15, 1), [s.x * 0.92 + Math.cos(s.a) * (k - 1), 0.85, s.z * 0.92 - Math.sin(s.a) * (k - 1)]);
  });
  pendants(kit, b, [[-4, 0], [4, 0]], 7, H, '#FDE68A');
  const plan: Record<HabitsSector, Placed> = {
    atrium: { x: 0, z: 8, face: Math.PI },
    greenhouse: { x: -5.5, z: -2, face: Math.PI / 2 },
    evolution: { x: 5.5, z: -2, face: -Math.PI / 2 },
    analysis: { x: 0, z: -7, face: 0 },
  };
  const groups = sectorsFrom(kit, scene, plan, HABITS_SECTORS, labels, '#E6B450', (id, sb) => {
    if (id === 'evolution' || id === 'analysis') {
      sb.add(kit.mat('#F4F1E8', { rough: 0.6 }), new THREE.BoxGeometry(2.8, 2, 0.1), [0, 1.5, -0.8]);
      for (let k = 0; k < 21; k++) sb.add(kit.mat(k % 3 ? '#86C58A' : '#DCEBD8', { rough: 0.6 }), new THREE.BoxGeometry(0.28, 0.28, 0.03), [-1.1 + (k % 7) * 0.36, 1.0 + Math.floor(k / 7) * 0.36, -0.73]);
    } else {
      sb.add(kit.mat('#8A6240', { rough: 0.8 }), new THREE.BoxGeometry(2.6, 0.9, 1), [0, 0.45, -0.3]);
      for (let k = 0; k < 4; k++) sb.add(kit.mat('#4C9A4F', { rough: 0.9 }), new THREE.IcosahedronGeometry(0.28, 1), [-0.9 + k * 0.6, 1.1, -0.3]);
    }
  });
  bench(kit, b, 0, 13, 0);
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, R - 2.5), target: new THREE.Vector3(0, 1.2, -2) };
  return {
    scene,
    sectors: HABITS_SECTORS,
    pickables: groups,
    room: { radius: R - 2, height: H },
    obstacles: [],
    view: (id) => viewOf(plan, id, overview),
    setData: (d) => names.set((d as NamesData).names),
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * GOALS — jardim interno em terraços com um pedestal por meta ativa
 * ===================================================================== */
export const GOALS_SECTORS = ['garden', 'achieved', 'analysis'] as const;
export type GoalsSector = (typeof GOALS_SECTORS)[number];

export function createGoalsInterior(kit: Kit, labels: Record<GoalsSector, string>): InteriorScene {
  const R = 16;
  const H = 9;
  const room = createRoom(kit, { radius: R, height: H, sides: 6, floor: '#EFEADB', glass: '#FEF3C7', frame: '#EAB308', accent: '#FDE68A', skylight: 5 });
  const { scene, b } = room;
  const stone = kit.mat('#E9E2D0', { rough: 0.8 });
  for (let k = 0; k < 3; k++) b.add(stone, new THREE.CylinderGeometry(6 - k * 1.6, 6.2 - k * 1.6, 0.5, 6), [0, 0.25 + k * 0.5, 0]);
  b.add(kit.mat('#EAB308', { metal: 0.6, rough: 0.3 }), new THREE.CylinderGeometry(0.2, 0.5, 4, 4), [0, 3.5, 0]);
  b.add(kit.mat('#FDE68A', { glow: true }), new THREE.OctahedronGeometry(0.5, 0), [0, 5.9, 0]);
  const names = boardsRing(kit, scene, 6, 11, 2.1, '#EAB308', 0.5);
  names.spots.forEach((s) => {
    b.add(stone, new THREE.BoxGeometry(1, 1.1, 1), [s.x * 0.9, 0.55, s.z * 0.9]);
    b.add(kit.mat('#FDE68A', { glow: true }), new THREE.SphereGeometry(0.25, 10, 8), [s.x * 0.9, 1.3, s.z * 0.9]);
  });
  pots(kit, b, [[-6, 12], [6, 12]]);
  const plan: Record<GoalsSector, Placed> = {
    garden: { x: 0, z: 8.5, face: Math.PI },
    achieved: { x: -7, z: -4, face: Math.PI * 0.7 },
    analysis: { x: 7, z: -4, face: -Math.PI * 0.7 },
  };
  const groups = sectorsFrom(kit, scene, plan, GOALS_SECTORS, labels, '#EAB308', (_id, sb) => {
    sb.add(stone, new THREE.BoxGeometry(2.4, 0.9, 1), [0, 0.45, -0.3]);
    sb.add(kit.mat('#EAB308', { metal: 0.6, rough: 0.3 }), new THREE.BoxGeometry(2.5, 0.06, 1.1), [0, 0.93, -0.3]);
  });
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, R - 2), target: new THREE.Vector3(0, 1.5, -2) };
  return {
    scene,
    sectors: GOALS_SECTORS,
    pickables: groups,
    room: { radius: R - 1.5, height: H },
    obstacles: [{ x: 0, z: 0, r: 6.2, h: 1.5 }],
    view: (id) => viewOf(plan, id, overview),
    setData: (d) => names.set((d as NamesData).names),
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * MUSIC — átrio do pavilhão com um espaço por instrumento
 * ===================================================================== */
export const MUSIC_SECTORS = ['atrium', 'instruments', 'analysis'] as const;
export type MusicSector = (typeof MUSIC_SECTORS)[number];

export function createMusicInterior(kit: Kit, labels: Record<MusicSector, string>): InteriorScene {
  const R = 16;
  const H = 9;
  const room = createRoom(kit, { radius: R, height: H, sides: 24, floor: '#F2EAEE', glass: '#F5D0E4', frame: '#EC4899', accent: '#F9A8D4', skylight: 4 });
  const { scene, b } = room;
  const wood = kit.mat('#B08560', { rough: 0.7 });
  // Painéis acústicos em ondas pelas paredes e palco pequeno ao fundo.
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    if (Math.cos(a) > 0.8) continue;
    b.add(wood, new THREE.BoxGeometry(1.6, 3 + Math.sin(i * 1.3) * 0.8, 0.2), [Math.sin(a) * (R - 0.8), 3.2, Math.cos(a) * (R - 0.8)], [0, a, 0]);
  }
  b.add(wood, new THREE.CylinderGeometry(4, 4.2, 0.6, 32, 1, false, -Math.PI / 2, Math.PI), [0, 0.3, -9]);
  const names = boardsRing(kit, scene, 6, 11.5, 2.6, '#EC4899', 0.6);
  names.spots.forEach((s) => b.add(kit.mat('#FCE7F3', { rough: 0.5 }), new THREE.CylinderGeometry(1.3, 1.3, 0.15, 24), [s.x * 0.9, 0.08, s.z * 0.9]));
  pendants(kit, b, [[-4, 2], [4, 2]], 6.5, H, '#FCE7F3');
  const plan: Record<MusicSector, Placed> = {
    atrium: { x: 0, z: 7.5, face: Math.PI },
    instruments: { x: -6.5, z: -3, face: Math.PI * 0.65 },
    analysis: { x: 6.5, z: -3, face: -Math.PI * 0.65 },
  };
  const groups = sectorsFrom(kit, scene, plan, MUSIC_SECTORS, labels, '#EC4899', (id, sb) => {
    if (id === 'instruments') {
      sb.add(wood, new THREE.CylinderGeometry(0.5, 0.7, 0.3, 16), [0, 0.95, 0], [Math.PI / 2.3, 0, 0]);
      sb.add(wood, new THREE.BoxGeometry(0.1, 1.6, 0.1), [0, 1.5, 0.5], [0.4, 0, 0]);
    } else {
      sb.add(kit.mat('#1F2A3A', { metal: 0.5 }), new THREE.BoxGeometry(2.4, 0.9, 1), [0, 0.45, -0.3]);
    }
  });
  bench(kit, b, 0, 12, 0);
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6, R - 2), target: new THREE.Vector3(0, 1.5, -3) };
  return {
    scene,
    sectors: MUSIC_SECTORS,
    pickables: groups,
    room: { radius: R - 1.5, height: H },
    obstacles: [{ x: 0, z: -9, r: 4, h: 0.6 }],
    view: (id) => viewOf(plan, id, overview),
    setData: (d) => names.set((d as NamesData).names),
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}

/* =====================================================================
 * SPORTS — átrio com linhas de quadra no piso e um espaço por modalidade
 * ===================================================================== */
export const SPORTS_SECTORS = ['atrium', 'modalities', 'analysis'] as const;
export type SportsSector = (typeof SPORTS_SECTORS)[number];

export function createSportsInterior(kit: Kit, labels: Record<SportsSector, string>): InteriorScene {
  const R = 17;
  const H = 10;
  const room = createRoom(kit, { radius: R, height: H, sides: 8, floor: '#E4E9E4', glass: '#BFE8CF', frame: '#2B3442', accent: '#22C55E', skylight: 4 });
  const { scene, b } = room;
  const line = room.accentMat;
  // Linhas de quadra no piso (o elemento exclusivo do átrio).
  b.add(line, new THREE.RingGeometry(4.6, 4.75, 64), [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
  for (const x of [-9, 9]) b.add(line, new THREE.PlaneGeometry(0.15, 20), [x, 0.012, 0], [-Math.PI / 2, 0, 0]);
  for (const z of [-10, 10, 0]) b.add(line, new THREE.PlaneGeometry(18, 0.15), [0, 0.012, z], [-Math.PI / 2, 0, 0]);
  const names = boardsRing(kit, scene, 6, 12.5, 2.8, '#22C55E', 0.6);
  names.spots.forEach((s) => b.add(kit.mat('#2B3442', { metal: 0.5, rough: 0.4 }), new THREE.BoxGeometry(2.6, 1.2, 0.4), [s.x * 0.95, 0.6, s.z * 0.95], [0, s.a, 0]));
  pendants(kit, b, [[-5, 0], [5, 0]], 8, H, '#F0FDF4');
  const plan: Record<SportsSector, Placed> = {
    atrium: { x: 0, z: 7, face: Math.PI },
    modalities: { x: -6, z: -4, face: Math.PI * 0.7 },
    analysis: { x: 6, z: -4, face: -Math.PI * 0.7 },
  };
  const groups = sectorsFrom(kit, scene, plan, SPORTS_SECTORS, labels, '#22C55E', (id, sb) => {
    if (id === 'modalities') {
      sb.add(kit.mat('#3B82F6', { rough: 0.8 }), new THREE.BoxGeometry(1.4, 0.05, 2.4), [-0.9, 0.05, 0]);
      sb.add(kit.mat('#4CAF50', { rough: 0.9 }), new THREE.BoxGeometry(1.4, 0.05, 2.4), [0.9, 0.05, 0]);
      sb.add(kit.mat('#FDE047', { rough: 0.5 }), new THREE.SphereGeometry(0.15, 12, 8), [-0.9, 0.25, 0]);
      sb.add(kit.mat('#F8FAFC', { rough: 0.5 }), new THREE.SphereGeometry(0.25, 12, 8), [0.9, 0.3, 0]);
    } else {
      sb.add(kit.mat('#2B3442', { metal: 0.5, rough: 0.4 }), new THREE.BoxGeometry(2.4, 0.9, 1), [0, 0.45, -0.3]);
      sb.add(kit.mat('#22C55E', { glow: true }), new THREE.BoxGeometry(1.8, 0.8, 0.05), [0, 1.35, -0.6], [-0.3, 0, 0]);
    }
  });
  finishRoom(room);
  const overview = { cam: new THREE.Vector3(0, 6.5, R - 2.5), target: new THREE.Vector3(0, 1.2, -2) };
  return {
    scene,
    sectors: SPORTS_SECTORS,
    pickables: groups,
    room: { radius: R - 2, height: H },
    obstacles: [],
    view: (id) => viewOf(plan, id, overview),
    setData: (d) => names.set((d as NamesData).names),
    tick: (t) => room.trees.tick(t),
    setDetail: (q) => setDetailCommon(room, q),
  };
}
